package az.millikart.auth.security;

import java.security.SecureRandom;
import java.util.Locale;

// Формат резервного кода второго фактора (Р-142): 8 знаков XXXX-XXXX из алфавита без похожих на вид (0/O,
// 1/I/L) — код переписывают с бумаги. 31^8 ≈ 2^40. Вводят как угодно: регистр, дефис и пробелы не важны.
public final class BackupCodes {

    public static final int COUNT = 10;

    private static final String ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    private static final int LENGTH = 8;

    private BackupCodes() {
    }

    // Как показывается пользователю: XXXX-XXXX.
    public static String generate(SecureRandom random) {
        StringBuilder code = new StringBuilder(LENGTH + 1);
        for (int i = 0; i < LENGTH; i++) {
            if (i == LENGTH / 2) {
                code.append('-');
            }
            code.append(ALPHABET.charAt(random.nextInt(ALPHABET.length())));
        }
        return code.toString();
    }

    // Как хэшируется и сверяется: 8 знаков алфавита без дефиса. null — ввод не резервный код.
    public static String normalize(String input) {
        if (input == null) {
            return null;
        }
        String compact = input.replace("-", "").replace(" ", "").toUpperCase(Locale.ROOT);
        if (compact.length() != LENGTH || !compact.chars().allMatch(c -> ALPHABET.indexOf(c) >= 0)) {
            return null;
        }
        return compact;
    }
}
