package az.millikart.auth.controller;

import az.millikart.auth.dto.MfaBackupCodesResponse;
import az.millikart.auth.dto.MfaBackupCodesStatus;
import az.millikart.auth.dto.MfaCodeRequest;
import az.millikart.auth.service.AuthService;
import az.millikart.common.security.UserPrincipal;
import az.millikart.common.web.ClientIp;
import az.millikart.common.web.TrustedProxies;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

// Резервные коды второго фактора вошедшего пользователя (Р-142) — только свои, по токену; чужих кодов нет ни у кого.
// Под /users, а не /auth: /auth публичен (PublicEndpoints), а здесь нужен вошедший.
@RestController
@RequestMapping("/api/v1/users/me/mfa-backup-codes")
public class MfaBackupCodesController {

    private final AuthService authService;
    private final TrustedProxies trustedProxies;

    public MfaBackupCodesController(AuthService authService, TrustedProxies trustedProxies) {
        this.authService = authService;
        this.trustedProxies = trustedProxies;
    }

    @GetMapping
    public MfaBackupCodesStatus status(@AuthenticationPrincipal UserPrincipal principal) {
        return authService.backupCodesStatus(principal);
    }

    // Адрес — для лимита попыток: неверный код из приложения считается неудачей входа.
    @PostMapping
    public MfaBackupCodesResponse regenerate(@Valid @RequestBody MfaCodeRequest request,
                                             @AuthenticationPrincipal UserPrincipal principal,
                                             HttpServletRequest httpRequest) {
        return authService.regenerateBackupCodes(request, principal,
                ClientIp.resolve(httpRequest, trustedProxies.addresses()));
    }
}
