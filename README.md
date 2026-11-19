# Banan — multiplayer

Сайт: https://zursed253-spec.github.io/banan.github.io/

## Развёртывание на бесплатном Render

1. Откройте https://dashboard.render.com/blueprints и войдите через GitHub.
2. Выберите **New Blueprint Instance**, затем репозиторий **zursed253-spec/banan.github.io**.
3. Render прочитает render.yaml. Подтвердите создание бесплатного Web Service.
4. После статуса **Live** проверьте адрес Render с /health на конце: JSON должен содержать "ok":true.
5. Откройте страницу игры, в поле «Сервер игры (Render)» укажите URL https://имя-сервиса.onrender.com без /ws.
6. Создайте комнату и отправьте другу скопированную ссылку. Она содержит код комнаты и адрес сервера.

Если Render выдаст адрес banan-zursed253-spec-relay.onrender.com, он уже настроен по умолчанию. Иначе введите фактический URL один раз.

Бесплатный Render засыпает без активности. Первое подключение после простоя может быть медленным.

## Техническая информация

- GitHub Pages размещает index.html, а Node.js WebSocket relay работает на Render.
- Сервер передаёт игровые события между двумя участниками: прямой P2P не нужен.
- Комнаты находятся в памяти сервера и исчезают при его перезапуске.
- /health служит проверкой работоспособности.
- Для локального запуска: cd server, npm install, npm test, npm start.
- Для локального запуска в браузере используйте адрес сервера http://localhost:10000.
