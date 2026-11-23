import React, { useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import { ContentCopy as CopyIcon, Download as DownloadIcon } from '@mui/icons-material';
import { useLanguage } from '../context/LanguageContext';

interface BackupCodesListProps {
  codes: string[];
  /** Логин — в заголовок файла: у человека бывают коды от нескольких учёток. */
  account: string;
}

// Резервные коды второго фактора (Р-142) показываются один раз — при подключении и при новом наборе. Файл и буфер
// обмена — по кнопке пользователя; в хранилище браузера коды не кладутся.
export const BackupCodesList: React.FC<BackupCodesListProps> = ({ codes, account }) => {
  const { tObj } = useLanguage();
  const [copied, setCopied] = useState(false);

  const text = `${tObj.auth.backupCodesFileTitle} — ${account}\n\n${codes.join('\n')}\n`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Буфер обмена запрещён — коды видны на экране и скачиваются файлом.
      setCopied(false);
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'millikart-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Stack spacing={2}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 1,
          p: 2,
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'action.hover',
        }}
      >
        {codes.map(code => (
          <Typography key={code} variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 600, textAlign: 'center' }}>
            {code}
          </Typography>
        ))}
      </Box>
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'center' }}>
        <Button size="small" variant="outlined" startIcon={<CopyIcon />} onClick={copy}>
          {copied ? tObj.common.copied : tObj.common.copy}
        </Button>
        <Button size="small" variant="outlined" startIcon={<DownloadIcon />} onClick={download}>
          {tObj.auth.downloadCodes}
        </Button>
      </Stack>
    </Stack>
  );
};
