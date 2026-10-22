/* ==========================================================================
   ТонПлат · Конфигурация контактов, условий и интеграции заявок
   Все файлы проекта лежат строго в одной папке (./...) без подпапок.
   ========================================================================== */
window.TONPLAT_CONFIG = {
  brandName: "ТонПлат",
  legalShort: "ООО «ТОН ПЛАТ»",
  legalFull: "Общество с ограниченной ответственностью «ТОН ПЛАТ»",
  inn: "6314049248",
  kpp: "631401001",
  ogrn: "1226300038326",
  city: "Самара",
  address: "г. Самара, ул. Комсомольская, 29",
  mapUrl: "https://yandex.ru/maps/?text=%D0%A1%D0%B0%D0%BC%D0%B0%D1%80%D0%B0%2C%20%D1%83%D0%BB.%20%D0%9A%D0%BE%D0%BC%D1%81%D0%BE%D0%BC%D0%BE%D0%BB%D1%8C%D1%81%D0%BA%D0%B0%D1%8F%2C%2029",
  phoneDisplay: "+7 (960) 812-13-33",
  phoneHref: "tel:+79608121333",
  whatsappNumber: "79608121333",
  telegramUrl: "https://t.me/+79608121333",
  vkUrl: "https://vk.com/ton_plat_samara",
  responsePromise: "Ответим в течение 15 минут",
  seasonNote: "Готовим с любовью · Самара и область",

  pricing: {
    buffetFrom: 400,
    coffeeBreakFrom: 550,
    banquetFrom: 1800,
    minOrder: 0
  },

  // Опционально: укажите URL вебхука (Formspree / Bitrix24 / свой PHP или Telegram-прокси),
  // чтобы заявки дублировались POST-запросом автоматически:
  webhookUrl: ""
};
