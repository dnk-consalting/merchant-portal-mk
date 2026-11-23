package az.millikart.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

// Свежий код из приложения — подтверждение действия вошедшего пользователя над его вторым фактором (Р-142).
public record MfaCodeRequest(
        @NotBlank(message = "Code is required")
        @Pattern(regexp = "\\d{6}", message = "Code must be 6 digits")
        String code
) {

    @Override
    public String toString() {
        return "MfaCodeRequest[code=***]";
    }
}
