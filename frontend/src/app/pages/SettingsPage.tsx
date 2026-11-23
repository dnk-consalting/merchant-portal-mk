import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import { CheckCircle as CheckCircleIcon } from '@mui/icons-material';

import { apiClient } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import type { Language } from '../i18n/translations';
import type { CompanyDto } from '../types/dto';
import { useCompanyName } from '../hooks/useCompanyName';
import { BackupCodesList } from '../components/BackupCodesList';

const BACKUP_CODES_PATH = '/api/v1/users/me/mfa-backup-codes';

interface BackupCodesStatus {
  mfaEnabled: boolean;
  remaining: number;
}

// Живы название компании, язык и резервные коды второго фактора (Р-142); выдуманные вкладки и настройки не
// возвращать (P3-6).
export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const { language, setLanguage, tObj } = useLanguage();
  const companyId = user?.companyId;
  // Название меняет только SYSTEM_ADMIN (CompanyService.updateCompany), компания — из claim токена.
  const canEditCompany = user?.role === 'SYSTEM_ADMIN' && Boolean(companyId);

  const [companyName, setCompanyName] = useState('');
  const [loadedName, setLoadedName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // null — ошибки нет; пустая строка — отказ без текста от бэкенда, показываем свой.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Одна компания по id из токена: список GET /companies остальным ролям — 403 и отказ в журнале.
  const company = useCompanyName(companyId);
  useEffect(() => {
    if (company.name !== null) {
      setCompanyName(company.name);
      setLoadedName(company.name);
    }
    setLoadError(company.error);
  }, [company.name, company.error]);

  const trimmedName = companyName.trim();
  // Пустое имя бэкенд молча пропускает и отвечает 200 — «сохранено» было бы неправдой.
  const canSave = canEditCompany && !saving && trimmedName.length > 0 && trimmedName !== loadedName;

  const handleSaveCompany = async () => {
    if (!companyId || !canSave) return;
    setSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      const res = await apiClient.patch<CompanyDto>(
        `/api/v1/companies/${encodeURIComponent(companyId)}`,
        { name: trimmedName },
      );
      const name = res.data?.name ?? trimmedName;
      setCompanyName(name);
      setLoadedName(name);
      setSaved(true);
    } catch (err: any) {
      setSaveError(err.response?.data?.message || '');
    } finally {
      setSaving(false);
    }
  };

  // Резервные коды (Р-142): остаток и новый набор по свежему коду из приложения. Коды — только в состоянии окна.
  const [mfaStatus, setMfaStatus] = useState<BackupCodesStatus | null>(null);
  const [mfaLoadFailed, setMfaLoadFailed] = useState(false);
  const [codesDialogOpen, setCodesDialogOpen] = useState(false);
  const [appCode, setAppCode] = useState('');
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [codesBusy, setCodesBusy] = useState(false);
  const [codesError, setCodesError] = useState('');

  const loadMfaStatus = useCallback(() => {
    apiClient.get<BackupCodesStatus>(BACKUP_CODES_PATH)
      .then(res => {
        setMfaStatus({ mfaEnabled: res.data?.mfaEnabled === true, remaining: Number(res.data?.remaining) || 0 });
        setMfaLoadFailed(false);
      })
      .catch(() => setMfaLoadFailed(true));
  }, []);
  useEffect(loadMfaStatus, [loadMfaStatus]);

  const openCodesDialog = () => {
    setAppCode('');
    setNewCodes(null);
    setCodesError('');
    setCodesDialogOpen(true);
  };

  const closeCodesDialog = () => {
    if (codesBusy) return;
    setCodesDialogOpen(false);
    setNewCodes(null);
    loadMfaStatus();
  };

  const handleCreateCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    if (codesBusy) return;
    if (!/^\d{6}$/.test(appCode)) {
      setCodesError(tObj.auth.mfaCodeFormat);
      return;
    }
    setCodesBusy(true);
    setCodesError('');
    try {
      const res = await apiClient.post<{ codes: string[] }>(BACKUP_CODES_PATH, { code: appCode });
      setNewCodes(Array.isArray(res.data?.codes) ? res.data.codes : []);
    } catch (err: any) {
      setAppCode('');
      setCodesError(err.response?.data?.message || tObj.settings.mfa.failed);
    } finally {
      setCodesBusy(false);
    }
  };

  const handleNameChange = (value: string) => {
    setCompanyName(value);
    setSaved(false);
    setSaveError(null);
  };

  return (
    <Box>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
          {tObj.settings.title}
        </Typography>
        <Typography variant="body1" color="text.secondary">
          {tObj.settings.subtitle}
        </Typography>
      </Box>

      {saved && (
        <Alert severity="success" sx={{ mb: 3 }} icon={<CheckCircleIcon />} onClose={() => setSaved(false)}>
          {tObj.settings.saveSuccess}
        </Alert>
      )}
      {saveError !== null && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setSaveError(null)}>
          {saveError || tObj.settings.account.saveFailed}
        </Alert>
      )}

      <Paper elevation={0} sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 3 }}>
          {tObj.settings.account.title}
        </Typography>

        {loadError !== null && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            {loadError || tObj.settings.account.loadFailed}
          </Alert>
        )}
        {!companyId && (
          <Alert severity="info" sx={{ mb: 3 }}>
            {tObj.settings.account.noCompany}
          </Alert>
        )}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3 }}>
          {companyId && (
            <TextField
              fullWidth
              label={tObj.settings.account.merchantName}
              value={companyName}
              onChange={e => handleNameChange(e.target.value)}
              disabled={!canEditCompany}
              helperText={canEditCompany ? undefined : tObj.settings.account.nameReadOnly}
            />
          )}
          <TextField
            fullWidth
            label={tObj.settings.account.merchantEmail}
            value={user?.email ?? ''}
            InputProps={{ readOnly: true }}
            helperText={tObj.settings.account.emailReadOnly}
          />
        </Box>

        {canEditCompany && (
          <Button variant="contained" size="large" sx={{ mt: 3 }} disabled={!canSave} onClick={handleSaveCompany}>
            {tObj.settings.saveChanges}
          </Button>
        )}

        <Divider sx={{ my: 4 }} />

        <Typography variant="h6" sx={{ fontWeight: 600, mb: 3 }}>
          {tObj.settings.display.title}
        </Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3 }}>
          <TextField
            select
            fullWidth
            label={tObj.settings.display.language}
            value={language}
            onChange={e => setLanguage(e.target.value as Language)}
          >
            <MenuItem value="en">English</MenuItem>
            <MenuItem value="az">Azərbaycan</MenuItem>
            <MenuItem value="ru">Русский</MenuItem>
          </TextField>
        </Box>

        <Divider sx={{ my: 4 }} />

        <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
          {tObj.settings.mfa.title}
        </Typography>
        {mfaLoadFailed && <Alert severity="warning">{tObj.common.loadFailed}</Alert>}
        {mfaStatus !== null && !mfaStatus.mfaEnabled && (
          <Typography variant="body2" color="text.secondary">{tObj.settings.mfa.notSetUp}</Typography>
        )}
        {mfaStatus !== null && mfaStatus.mfaEnabled && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
            <Box>
              <Typography variant="body2" color="text.secondary">{tObj.settings.mfa.hint}</Typography>
              <Typography variant="body1" sx={{ mt: 1 }}>
                {tObj.settings.mfa.remaining}: <strong>{mfaStatus.remaining} / 10</strong>
              </Typography>
              {mfaStatus.remaining <= 2 && (
                <Alert severity="warning" sx={{ mt: 1 }}>{tObj.settings.mfa.lowWarning}</Alert>
              )}
            </Box>
            <Button variant="outlined" onClick={openCodesDialog}>{tObj.settings.mfa.create}</Button>
          </Box>
        )}
      </Paper>

      <Dialog open={codesDialogOpen} onClose={closeCodesDialog} maxWidth="xs" fullWidth>
        <DialogTitle>{tObj.settings.mfa.dialogTitle}</DialogTitle>
        {newCodes === null ? (
          <form onSubmit={handleCreateCodes} noValidate>
            <DialogContent>
              <Typography variant="body2" sx={{ mb: 2 }}>{tObj.settings.mfa.dialogText}</Typography>
              {codesError && <Alert severity="error" sx={{ mb: 2 }}>{codesError}</Alert>}
              <TextField
                fullWidth
                autoFocus
                label={tObj.auth.mfaCodeLabel}
                name="one-time-code"
                autoComplete="one-time-code"
                value={appCode}
                onChange={e => setAppCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={codesBusy}
                inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 6 }}
              />
            </DialogContent>
            <DialogActions>
              <Button onClick={closeCodesDialog} disabled={codesBusy}>{tObj.common.cancel}</Button>
              <Button type="submit" variant="contained" disabled={codesBusy}>{tObj.settings.mfa.create}</Button>
            </DialogActions>
          </form>
        ) : (
          <>
            <DialogContent>
              <Alert severity="warning" sx={{ mb: 2 }}>{tObj.settings.mfa.saveCodes}</Alert>
              <BackupCodesList codes={newCodes} account={user?.email ?? ''} />
            </DialogContent>
            <DialogActions>
              <Button variant="contained" onClick={closeCodesDialog}>{tObj.settings.mfa.done}</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};
