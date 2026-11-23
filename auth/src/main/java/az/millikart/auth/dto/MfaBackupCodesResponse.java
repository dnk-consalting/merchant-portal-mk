package az.millikart.auth.dto;

import java.util.List;

// Новый набор резервных кодов (Р-142): отдаётся один раз, в базе — только хэши.
public record MfaBackupCodesResponse(List<String> codes) {

    @Override
    public String toString() {
        return "MfaBackupCodesResponse[codes=***]";
    }
}
