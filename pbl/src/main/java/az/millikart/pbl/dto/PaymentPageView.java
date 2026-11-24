package az.millikart.pbl.dto;

import java.math.BigDecimal;

// Страница по адресу ссылки до кнопки «Оплатить» (Р-143). Данных клиента одноразовой ссылки здесь нет и не
// класть: адрес пересылают, а боты превью мессенджеров читают страницу целиком.
public record PaymentPageView(String merchantName, BigDecimal amount, String currency, String description) {
}
