package az.millikart.auth.dto;

// Второй фактор вошедшего пользователя (Р-142): подключён ли и сколько резервных кодов осталось.
public record MfaBackupCodesStatus(boolean mfaEnabled, long remaining) {
}
