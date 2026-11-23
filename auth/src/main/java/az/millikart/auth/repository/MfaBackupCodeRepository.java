package az.millikart.auth.repository;

import az.millikart.auth.domain.MfaBackupCode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

@Repository
public interface MfaBackupCodeRepository extends JpaRepository<MfaBackupCode, UUID> {

    List<MfaBackupCode> findAllByUserIdAndUsedAtIsNull(UUID userId);

    long countByUserIdAndUsedAtIsNull(UUID userId);

    // Условный UPDATE: 0 строк — код уже израсходован встречным входом. Без clearAutomatically: правки
    // пользователя в той же транзакции остаются в сессии и сохраняются.
    @Modifying(flushAutomatically = true)
    @Query("UPDATE MfaBackupCode c SET c.usedAt = :now WHERE c.id = :id AND c.usedAt IS NULL")
    int markUsedIfUnused(@Param("id") UUID id, @Param("now") Instant now);

    // Новый набор и сброс фактора: прежние коды больше не входят.
    @Modifying(flushAutomatically = true)
    @Query("DELETE FROM MfaBackupCode c WHERE c.userId = :userId")
    int deleteAllByUserId(@Param("userId") UUID userId);
}
