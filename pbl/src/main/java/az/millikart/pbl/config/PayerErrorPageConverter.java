package az.millikart.pbl.config;

import az.millikart.common.dto.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpInputMessage;
import org.springframework.http.HttpOutputMessage;
import org.springframework.http.MediaType;
import org.springframework.http.converter.AbstractHttpMessageConverter;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.util.AntPathMatcher;
import org.springframework.util.PathMatcher;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.thymeleaf.ITemplateEngine;
import org.thymeleaf.context.Context;

// Отказ по адресу ссылки браузеру — страницей pay.html, а не JSON (Р-143). Статус и лог решают общие обработчики
// (GlobalExceptionHandler, AcquirerUnavailableHandler), здесь только вид. Плательщику — одно из трёх состояний по
// статусу; текст отказа не выводится: в нём бывает формулировка провайдера.
public class PayerErrorPageConverter extends AbstractHttpMessageConverter<ErrorResponse> {

    private static final PathMatcher MATCHER = new AntPathMatcher();
    private static final String LINK_ADDRESS = "/api/v1/payment-links/*/open";

    private final ITemplateEngine templateEngine;

    public PayerErrorPageConverter(ITemplateEngine templateEngine) {
        super(StandardCharsets.UTF_8, MediaType.TEXT_HTML);
        this.templateEngine = templateEngine;
    }

    @Override
    protected boolean supports(Class<?> clazz) {
        return ErrorResponse.class.isAssignableFrom(clazz);
    }

    // Только адрес ссылки: остальные пути без токена браузер видит лишь как 401, а с токеном ходит фронтенд за JSON.
    @Override
    public boolean canWrite(Class<?> clazz, MediaType mediaType) {
        HttpServletRequest request = currentRequest();
        return super.canWrite(clazz, mediaType) && request != null && onLinkAddress(request);
    }

    @Override
    public boolean canRead(Class<?> clazz, MediaType mediaType) {
        return false;
    }

    @Override
    protected ErrorResponse readInternal(Class<? extends ErrorResponse> clazz, HttpInputMessage inputMessage) {
        throw new HttpMessageNotReadableException("Error pages are written, never read", inputMessage);
    }

    @Override
    protected void writeInternal(ErrorResponse error, HttpOutputMessage outputMessage) throws IOException {
        HttpServletRequest request = currentRequest();
        Context context = new Context();
        context.setVariable("failure", failureOf(error.status(), request != null ? request.getMethod() : null));
        outputMessage.getBody().write(templateEngine.process("pay", context).getBytes(StandardCharsets.UTF_8));
    }

    // GET отказывает только на битом адресе — для плательщика это недоступная ссылка, а не сбой.
    static String failureOf(int status, String method) {
        if (!"POST".equals(method) || status == 403 || status == 404) {
            return "UNAVAILABLE";
        }
        return status == 409 ? "BUSY" : "FAILED";
    }

    private static boolean onLinkAddress(HttpServletRequest request) {
        String path = request.getRequestURI().substring(request.getContextPath().length());
        return MATCHER.match(LINK_ADDRESS, path);
    }

    private static HttpServletRequest currentRequest() {
        return RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes
                ? attributes.getRequest()
                : null;
    }
}
