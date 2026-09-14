# Нархан тэргүүн хүнс — Stage 3

Энэ хувилбарт:
- Брэндийн нэр: Нархан тэргүүн хүнс
- Demo PIN public UI-аас арилсан
- Админ PIN-ийн default сервер утга: 0110
- Shared database/API архитектур нэмэгдсэн
- Хэрэглэгчийн захиалга database-д хадгалах
- Админ бүх захиалгыг нэг дор харах
- Төлбөр батлах
- Захиалгын төлөв ахиулах
- Захиалгыг дугаар + утсаар хянах
- ХААН Банк QR зураг тохиргооноос уншихад бэлэн

## Жинхэнэ shared database идэвхжүүлэх
1. Supabase дээр project үүсгэ.
2. SQL Editor дээр `supabase.sql` файлын SQL-ийг ажиллуул.
3. Netlify -> Site configuration -> Environment variables хэсэгт:
   - SUPABASE_URL
   - SUPABASE_SERVICE_ROLE_KEY
   - ADMIN_PIN = 0110
4. Энэ төслийг GitHub-аас Netlify-д deploy хий.
5. Deploy дууссаны дараа хэрэглэгч бүрийн захиалга ижил database-д орно.

АНХААР:
SUPABASE_SERVICE_ROLE_KEY-г index.html эсвэл browser JavaScript дотор ХЭЗЭЭ Ч бүү тавь.
ADMIN_PIN-ийг Netlify environment variable дээр хадгалах нь зөв.

## ХААН Банк
Одоогоор QR зураг харуулах хэсэг бэлэн.
Төлбөрийг автоматаар батлахын тулд ХААН Банкны merchant/payment API-ийн албан ёсны эрх, credential хэрэгтэй.
API credential байхгүй үед админ "Төлбөр батлах" товчоор гар аргаар батална.


## Telegram мэдэгдэл
Шинэ захиалга ормогц Telegram руу автоматаар мэдэгдэл илгээнэ.

### 1. Telegram bot үүсгэх
- Telegram дээр `@BotFather`-г нээ.
- `/newbot` гэж бичээд bot үүсгэ.
- BotFather-аас өгсөн token-ийг зөвхөн өөртөө хадгал.

### 2. Chat ID авах
- Шинэ bot руугаа нэг мессеж илгээ.
- Browser дээр Telegram Bot API-ийн `getUpdates` хариунаас `chat.id` утгыг авна.
- Хэрэв group руу мэдэгдэл авах бол bot-оо group-д нэмээд тухайн group-ийн chat id-г ашиглана.

### 3. Netlify environment variables
Netlify -> Site configuration -> Environment variables хэсэгт дараахыг нэм:
- TELEGRAM_BOT_TOKEN = BotFather token
- TELEGRAM_CHAT_ID = таны Telegram chat id

Өмнөх:
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- ADMIN_PIN = 0110

гэсэн хувьсагчид хэвээр байна.

### 4. Redeploy
Environment variable нэмсний дараа Netlify дээр шинэ deploy хийнэ.

### Аюулгүй байдал
TELEGRAM_BOT_TOKEN болон SUPABASE_SERVICE_ROLE_KEY-г `index.html` эсвэл public JavaScript дотор хэзээ ч бүү хий.
Эдгээрийг зөвхөн Netlify environment variables дотор хадгал.
