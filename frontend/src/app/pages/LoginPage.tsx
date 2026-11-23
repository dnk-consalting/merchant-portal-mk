import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import axios from 'axios';
import { useAuth, type MfaSetup, type MfaStep, type MfaVerification } from '../context/AuthContext';
import {
  AuthError,
  clearIdleNotice,
  clearSessionLimitNotice,
  hasIdleNotice,
  hasSessionLimitNotice,
} from '../auth/session';
import { returnPathFrom } from '../auth/guards';
import { meetsPasswordPolicy } from '../utils/password';
import { QrCodeSvg, buildQrMatrix } from '../components/QrCodeSvg';
import { BackupCodesList } from '../components/BackupCodesList';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  IconButton,
  InputAdornment,
  Alert,
  Stack,
  CircularProgress,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import {
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  Lock as LockIcon,
  Email as EmailIcon,
} from '@mui/icons-material';

import { useLanguage } from '../context/LanguageContext';
import logoUrl from '../assets/millikart-logo.png';

// Без «Forgot password»: бэкенд его не умеет, а выдуманного на экранах не бывает (Р-48).
export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, changePassword, setupMfa, verifyMfa } = useAuth();
  const { tObj } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Пароль задал не владелец (PCI DSS 8.3.5, Р-100): после верного пароля — форма смены, сессия после неё.
  // Второй фактор (PCI DSS 8.4.2, Р-141): после пароля — подключение по QR-коду или ввод кода, сессия после кода.
  // Резервные коды (Р-142): после подключения — экран выданных кодов, после входа резервным кодом — их остаток.
  const [mode, setMode] = useState<'signIn' | 'changePassword' | 'mfaSetup' | 'mfaCode' | 'backupCodes' | 'backupUsed'>('signIn');
  const [mfaStep, setMfaStep] = useState<MfaStep | null>(null);
  // Секрет живёт только в состоянии формы, пока идёт подключение.
  const [mfaSetup, setMfaSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState('');
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [verification, setVerification] = useState<MfaVerification | null>(null);
  const [codesSaved, setCodesSaved] = useState(false);
  const qrMatrix = useMemo(() => (mfaSetup ? buildQrMatrix(mfaSetup.otpauthUri) : null), [mfaSetup]);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Выход по простою (PCI DSS 8.2.8, Р-99) — сказать один раз, почему снова форма входа.
  const [idleNotice, setIdleNotice] = useState(hasIdleNotice);
  // Предельный срок сессии от входа (Р-140) — тоже сказать, почему снова форма входа.
  const [sessionLimitNotice, setSessionLimitNotice] = useState(hasSessionLimitNotice);
  useEffect(() => {
    clearIdleNotice();
    clearSessionLimitNotice();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError('');

    if (!email.trim() || !password) {
      setError(tObj.auth.fillBoth);
      return;
    }
    if (!email.includes('@')) {
      setError(tObj.auth.invalidEmail);
      return;
    }

    setIsLoading(true);
    try {
      const step = await login(email.trim(), password);
      if (step !== null) {
        await enterSecondFactor(step);
        return;
      }
      // replace: «назад» не должен возвращать на форму входа.
      navigate(returnPathFrom(location.state), { replace: true });
    } catch (err: unknown) {
      setIsLoading(false);
      if (err instanceof AuthError && err.code === 'PASSWORD_CHANGE_REQUIRED') {
        setMode('changePassword');
        return;
      }
      if (err instanceof AuthError) {
        // 200, но сессию из ответа не собрать — вход отклонён на клиенте (fail-closed).
        setError(err.code === 'UNKNOWN_ROLE' ? tObj.auth.unknownRole : tObj.auth.malformedResponse);
        return;
      }
      if (axios.isAxiosError(err) && !err.response) {
        // Запрос до сервера не дошёл: предлагать «проверьте пароль» было бы неправдой.
        setError(tObj.auth.networkError);
        return;
      }
      setError(serverMessageOf(err) ?? tObj.auth.authFailed);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError('');

    if (!meetsPasswordPolicy(newPassword)) {
      setError(tObj.auth.passwordRules);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(tObj.auth.passwordsDoNotMatch);
      return;
    }
    if (newPassword === password) {
      setError(tObj.auth.samePassword);
      return;
    }

    setIsLoading(true);
    try {
      const step = await changePassword(email.trim(), password, newPassword);
      if (step !== null) {
        await enterSecondFactor(step);
        return;
      }
      navigate(returnPathFrom(location.state), { replace: true });
    } catch (err: unknown) {
      setIsLoading(false);
      if (axios.isAxiosError(err) && !err.response) {
        setError(tObj.auth.networkError);
        return;
      }
      setError(serverMessageOf(err) ?? tObj.auth.authFailed);
    }
  };

  // Фактор не подключён — сразу просим секрет: без него нечего сканировать.
  const enterSecondFactor = async (step: MfaStep) => {
    setMfaStep(step);
    setCode('');
    setUseBackupCode(false);
    try {
      if (step.setupRequired) {
        setMfaSetup(await setupMfa(step.mfaToken));
        setMode('mfaSetup');
      } else {
        setMode('mfaCode');
      }
    } catch (err: unknown) {
      backToSignIn();
      setError(axios.isAxiosError(err) && err.response?.status === 401 ? tObj.auth.mfaStepExpired : tObj.auth.mfaLoadFailed);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || mfaStep === null) return;
    setError('');
    if (useBackupCode ? !/^[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}$/.test(code) : !/^\d{6}$/.test(code)) {
      setError(useBackupCode ? tObj.auth.backupCodeFormat : tObj.auth.mfaCodeFormat);
      return;
    }

    setIsLoading(true);
    try {
      const result = await verifyMfa(mfaStep.mfaToken, code, email.trim());
      if (result.backupCodes !== null || result.backupCodesLeft !== null) {
        setVerification(result);
        setCodesSaved(false);
        setMode(result.backupCodes !== null ? 'backupCodes' : 'backupUsed');
        setIsLoading(false);
        return;
      }
      result.complete();
      navigate(returnPathFrom(location.state), { replace: true });
    } catch (err: unknown) {
      setIsLoading(false);
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        // Шаг входа истёк или израсходован: начинать с пароля.
        backToSignIn();
        setError(tObj.auth.mfaStepExpired);
        return;
      }
      if (axios.isAxiosError(err) && !err.response) {
        setError(tObj.auth.networkError);
        return;
      }
      if (err instanceof AuthError) {
        backToSignIn();
        setError(err.code === 'UNKNOWN_ROLE' ? tObj.auth.unknownRole : tObj.auth.malformedResponse);
        return;
      }
      setCode('');
      setError(serverMessageOf(err) ?? tObj.auth.authFailed);
    }
  };

  // Сессия начинается здесь, после экрана с кодами: раньше страница входа сразу ушла бы в портал.
  const finishSignIn = () => {
    if (verification === null) return;
    try {
      verification.complete();
      navigate(returnPathFrom(location.state), { replace: true });
    } catch (err: unknown) {
      backToSignIn();
      setError(err instanceof AuthError && err.code === 'UNKNOWN_ROLE' ? tObj.auth.unknownRole : tObj.auth.malformedResponse);
    }
  };

  const toggleBackupCode = () => {
    setUseBackupCode(current => !current);
    setCode('');
    setError('');
  };

  const backToSignIn = () => {
    setMode('signIn');
    setError('');
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setMfaStep(null);
    setMfaSetup(null);
    setCode('');
    setUseBackupCode(false);
    setVerification(null);
    setCodesSaved(false);
  };

  // key: при смене вида кода поле пересоздаётся — с фокусом и своей клавиатурой на телефоне.
  const codeField = useBackupCode ? (
    <TextField
      key="backup-code"
      fullWidth
      label={tObj.auth.backupCodeLabel}
      name="backup-code"
      autoComplete="off"
      autoFocus
      value={code}
      onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 9))}
      disabled={isLoading}
      inputProps={{ maxLength: 9, style: { fontFamily: 'monospace' } }}
    />
  ) : (
    <TextField
      key="app-code"
      fullWidth
      label={tObj.auth.mfaCodeLabel}
      name="one-time-code"
      autoComplete="one-time-code"
      autoFocus
      value={code}
      onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
      disabled={isLoading}
      inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6 }}
    />
  );

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'grey.50',
        p: 3,
        backgroundImage: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Paper
        elevation={8}
        sx={{
          width: '100%',
          maxWidth: 480,
          p: 5,
          position: 'relative',
          zIndex: 1,
          borderRadius: 3
        }}
      >
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box
            component="img"
            src={logoUrl}
            alt="MilliKart group"
            sx={{ display: 'block', width: 180, height: 'auto', mx: 'auto', mb: 3 }}
          />
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1, color: 'text.primary' }}>
            {tObj.header.title}
          </Typography>
          <Typography variant="body1" color="text.secondary">
            {tObj.auth.subtitle}
          </Typography>
        </Box>

        {idleNotice && !error && (
          <Alert severity="info" sx={{ mb: 3 }} onClose={() => setIdleNotice(false)}>
            {tObj.auth.idleSignedOut}
          </Alert>
        )}

        {sessionLimitNotice && !idleNotice && !error && (
          <Alert severity="info" sx={{ mb: 3 }} onClose={() => setSessionLimitNotice(false)}>
            {tObj.auth.sessionLimitSignedOut}
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {mode === 'changePassword' && (
          <form onSubmit={handleChangePassword} noValidate>
            <Stack spacing={3}>
              <Alert severity="info">{tObj.auth.passwordChangeRequired}</Alert>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{email.trim()}</Typography>
              <TextField
                fullWidth
                label={tObj.auth.newPasswordLabel}
                name="new-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                autoFocus
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isLoading}
                helperText={tObj.auth.passwordRules}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" disabled={isLoading} tabIndex={-1}>
                        {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
              <TextField
                fullWidth
                label={tObj.auth.confirmPasswordLabel}
                name="confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
              />
              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={isLoading}
                sx={{ py: 1.75, fontWeight: 600, fontSize: '1rem' }}
              >
                {isLoading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : tObj.auth.changePasswordAndSignIn}
              </Button>
              <Button onClick={backToSignIn} disabled={isLoading}>{tObj.common.back}</Button>
            </Stack>
          </form>
        )}

        {mode === 'mfaSetup' && mfaSetup !== null && qrMatrix !== null && (
          <form onSubmit={handleVerify} noValidate>
            <Stack spacing={3}>
              <Alert severity="info">{tObj.auth.mfaSetupIntro}</Alert>
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <QrCodeSvg matrix={qrMatrix} size={200} ariaLabel={tObj.auth.mfaQrLabel} />
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">{tObj.auth.mfaManualKey}</Typography>
                <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 600, wordBreak: 'break-all' }}>
                  {mfaSetup.secret.match(/.{1,4}/g)?.join(' ')}
                </Typography>
              </Box>
              {codeField}
              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={isLoading}
                sx={{ py: 1.75, fontWeight: 600, fontSize: '1rem' }}
              >
                {isLoading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : tObj.auth.mfaConfirmAndSignIn}
              </Button>
              <Button onClick={backToSignIn} disabled={isLoading}>{tObj.common.back}</Button>
            </Stack>
          </form>
        )}

        {mode === 'mfaCode' && (
          <form onSubmit={handleVerify} noValidate>
            <Stack spacing={3}>
              <Alert severity="info">{useBackupCode ? tObj.auth.backupCodeIntro : tObj.auth.mfaCodeIntro}</Alert>
              <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{email.trim()}</Typography>
              {codeField}
              <Button
                type="submit"
                variant="contained"
                size="large"
                fullWidth
                disabled={isLoading}
                sx={{ py: 1.75, fontWeight: 600, fontSize: '1rem' }}
              >
                {isLoading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : tObj.auth.signIn}
              </Button>
              <Button size="small" onClick={toggleBackupCode} disabled={isLoading}>
                {useBackupCode ? tObj.auth.useAppCode : tObj.auth.useBackupCode}
              </Button>
              <Button onClick={backToSignIn} disabled={isLoading}>{tObj.common.back}</Button>
            </Stack>
          </form>
        )}

        {mode === 'backupCodes' && verification?.backupCodes && (
          <Stack spacing={3}>
            <Alert severity="warning">{tObj.auth.backupCodesIntro}</Alert>
            <BackupCodesList codes={verification.backupCodes} account={email.trim()} />
            <FormControlLabel
              control={<Checkbox checked={codesSaved} onChange={(e) => setCodesSaved(e.target.checked)} />}
              label={tObj.auth.backupCodesSaved}
            />
            <Button
              variant="contained"
              size="large"
              fullWidth
              disabled={!codesSaved}
              onClick={finishSignIn}
              sx={{ py: 1.75, fontWeight: 600, fontSize: '1rem' }}
            >
              {tObj.auth.continue}
            </Button>
          </Stack>
        )}

        {mode === 'backupUsed' && verification !== null && verification.backupCodesLeft !== null && (
          <Stack spacing={3}>
            <Alert severity={verification.backupCodesLeft > 2 ? 'info' : 'warning'}>
              {tObj.auth.backupUsed}
              {' '}
              {verification.backupCodesLeft === 0 ? tObj.auth.backupNoneLeft : tObj.auth.backupUsedHint}
            </Alert>
            <Box sx={{ p: 2, borderRadius: 1, border: '1px solid', borderColor: 'divider', bgcolor: 'action.hover' }}>
              <Typography variant="body2" color="text.secondary">{tObj.auth.backupCodesLeft}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>{verification.backupCodesLeft}</Typography>
            </Box>
            <Button
              variant="contained"
              size="large"
              fullWidth
              onClick={finishSignIn}
              sx={{ py: 1.75, fontWeight: 600, fontSize: '1rem' }}
            >
              {tObj.auth.continue}
            </Button>
          </Stack>
        )}

        {/* noValidate: подсказки браузера для type="email" идут на его языке и раньше наших. */}
        {mode === 'signIn' && (
        <form onSubmit={handleLogin} noValidate>
          <Stack spacing={3}>
            <TextField
              fullWidth
              label={tObj.auth.emailLabel}
              name="username"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailIcon color="action" />
                  </InputAdornment>
                )
              }}
            />

            <TextField
              fullWidth
              label={tObj.auth.passwordLabel}
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <LockIcon color="action" />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      disabled={isLoading}
                      tabIndex={-1}
                    >
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />

            <Button
              type="submit"
              variant="contained"
              size="large"
              fullWidth
              disabled={isLoading}
              sx={{ py: 1.75, fontWeight: 600, fontSize: '1rem' }}
            >
              {isLoading ? <CircularProgress size={24} sx={{ color: 'white' }} /> : tObj.auth.signIn}
            </Button>
          </Stack>
        </form>
        )}
      </Paper>
    </Box>
  );
};

const serverMessageOf = (err: unknown): string | null => {
  const message = axios.isAxiosError(err) ? (err.response?.data?.message || err.response?.data?.error) : undefined;
  return typeof message === 'string' && message ? message : null;
};
