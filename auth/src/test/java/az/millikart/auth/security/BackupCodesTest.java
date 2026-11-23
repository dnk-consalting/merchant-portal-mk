package az.millikart.auth.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.security.SecureRandom;
import java.util.HashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

// Р-142: резервный код переписывают с бумаги и вводят как попало. Ошибка формата — код, который владелец набрал
// верно, а сервер не узнал, или код, в котором 0 не отличить от O.
class BackupCodesTest {

    @Test
    void aGeneratedCode_isXXXX_XXXX_withoutLookAlikeCharacters() {
        SecureRandom random = new SecureRandom();
        Set<String> seen = new HashSet<>();
        for (int i = 0; i < 1000; i++) {
            String code = BackupCodes.generate(random);
            assertTrue(code.matches("[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}"), code);
            seen.add(code);
        }
        assertTrue(seen.size() > 990, "40 bits do not repeat in a thousand codes");
    }

    @Test
    void aCodeIsRecognisedHoweverItIsTyped() {
        assertEquals("ABCD2345", BackupCodes.normalize("ABCD-2345"));
        assertEquals("ABCD2345", BackupCodes.normalize("abcd2345"));
        assertEquals("ABCD2345", BackupCodes.normalize("abcd 2345"));
    }

    @Test
    void anythingElse_isNotABackupCode() {
        assertNull(BackupCodes.normalize(null));
        assertNull(BackupCodes.normalize("123456"));
        assertNull(BackupCodes.normalize("ABCD-23456"));
        assertNull(BackupCodes.normalize("ABCD-O123"), "0, O, 1, I and L are never generated");
        assertNull(BackupCodes.normalize("ABCD-L234"));
        assertNull(BackupCodes.normalize("ABCD_2345"));
    }
}
