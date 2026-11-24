package az.millikart.pbl.config;

import java.util.List;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.thymeleaf.ITemplateEngine;

@Configuration
public class PayerErrorPageConfig implements WebMvcConfigurer {

    private final ITemplateEngine templateEngine;

    public PayerErrorPageConfig(ITemplateEngine templateEngine) {
        this.templateEngine = templateEngine;
    }

    // В конец списка, после Jackson: при Accept */* (Postman, curl, MockMvc) отказ остаётся JSON. Браузер просит
    // text/html весом 1.0, а */* — 0.8, поэтому ему достаётся страница (Р-143).
    @Override
    public void extendMessageConverters(List<HttpMessageConverter<?>> converters) {
        converters.add(new PayerErrorPageConverter(templateEngine));
    }
}
