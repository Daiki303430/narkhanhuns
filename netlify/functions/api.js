const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_PIN = process.env.ADMIN_PIN || "0110";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const headers = {
  "Content-Type": "application/json",
  "apikey": SB_KEY || "",
  "Authorization": `Bearer ${SB_KEY || ""}`
};

const j = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  },
  body: JSON.stringify(body)
});

async function sb(path, opts = {}) {
  if (!SB_URL || !SB_KEY) {
    throw new Error("Database is not configured");
  }

  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      ...headers,
      ...(opts.headers || {})
    }
  });

  const text = await r.text();

  if (!r.ok) {
    throw new Error(text || r.statusText);
  }

  return text ? JSON.parse(text) : null;
}

const auth = (event) =>
  (event.headers["x-admin-pin"] || event.headers["X-Admin-Pin"]) === ADMIN_PIN;

async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error("TELEGRAM CONFIG MISSING", {
      hasToken: !!TELEGRAM_BOT_TOKEN,
      hasChatId: !!TELEGRAM_CHAT_ID
    });
    return;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: text
        })
      }
    );

    const result = await response.json();

    if (!response.ok || result.ok === false) {
      console.error("TELEGRAM SEND FAILED", {
        status: response.status,
        description: result.description
      });
    } else {
      console.log("TELEGRAM SEND SUCCESS", {
        chatId: TELEGRAM_CHAT_ID
      });
    }
  } catch (error) {
    console.error("TELEGRAM REQUEST ERROR", error.message);
  }
}

exports.handler = async (event) => {
  try {
    const q = event.queryStringParameters || {};
    const action = q.action || "bootstrap";

    if (action === "bootstrap") {
      const [products, zones, settings] = await Promise.all([
        sb("products?select=*&active=eq.true&order=id.asc"),
        sb("zones?select=*&active=eq.true&order=id.asc"),
        sb("settings?select=*&id=eq.1")
      ]);

      return j(200, {
        products,
        zones,
        settings: settings?.[0] || {}
      });
    }

    if (action === "order" && event.httpMethod === "POST") {
      const b = JSON.parse(event.body || "{}");

      if (
        !b.name ||
        !b.phone ||
        !b.address ||
        !Array.isArray(b.items) ||
        !b.items.length
      ) {
        return j(400, { error: "Захиалгын мэдээлэл дутуу байна" });
      }

      const id = "BZ-" + String(Date.now()).slice(-6);
      const total = Number(b.subtotal || 0) + Number(b.delivery_fee || 0);

      await sb("orders", {
        method: "POST",
        headers: {
          "Prefer": "return=minimal"
        },
        body: JSON.stringify({
          id,
          name: b.name,
          phone: b.phone,
          address: b.address,
          zone_id: b.zone_id,
          zone_name: b.zone_name,
          delivery_fee: b.delivery_fee,
          delivery_time: b.delivery_time,
          payment_ref: b.payment_ref || "",
          subtotal: b.subtotal,
          total,
          items: b.items,
          status: "Шинэ",
          payment_status: "Хүлээгдэж байна"
        })
      });

      const itemLines = (b.items || [])
        .map(
          (x) =>
            `• ${x.name} × ${x.qty} — ${Number(x.price) * Number(x.qty)}₮`
        )
        .join("\n");

      await sendTelegram(
`🛎 ШИНЭ ЗАХИАЛГА
№ ${id}
Нэр: ${b.name}
Утас: ${b.phone}
Бүс: ${b.zone_name || "-"}
Хаяг: ${b.address}
Хүргэлт: ${b.delivery_time || "-"}

${itemLines}

Барааны дүн: ${Number(b.subtotal || 0)}₮
Хүргэлт: ${Number(b.delivery_fee || 0)}₮
НИЙТ: ${total}₮
Төлбөр: Хүлээгдэж байна`
      );

      return j(200, { id });
    }

    if (action === "track") {
      const rows = await sb(
        `orders?select=id,phone,zone_name,total,status,payment_status,delivery_time&id=eq.${encodeURIComponent(
          q.id || ""
        )}&phone=eq.${encodeURIComponent(q.phone || "")}&limit=1`
      );

      return rows?.[0]
        ? j(200, rows[0])
        : j(404, { error: "Захиалга олдсонгүй" });
    }

    if (action === "admin_orders") {
      if (!auth(event)) {
        return j(401, { error: "PIN буруу" });
      }

      const rows = await sb(
        "orders?select=*&order=created_at.desc&limit=200"
      );

      return j(200, rows);
    }

    if (action === "admin_update" && event.httpMethod === "POST") {
      if (!auth(event)) {
        return j(401, { error: "PIN буруу" });
      }

      const b = JSON.parse(event.body || "{}");

      const rows = await sb(
        `orders?select=status,payment_status&id=eq.${encodeURIComponent(
          b.id
        )}&limit=1`
      );

      const o = rows?.[0];

      if (!o) {
        return j(404, { error: "Захиалга олдсонгүй" });
      }

      const patch = {};

      if (b.op === "paid") {
        patch.payment_status = "Баталгаажсан";
      }

      if (b.op === "advance") {
        const list = [
          "Шинэ",
          "Бэлтгэж байна",
          "Хүргэлтэнд гарсан",
          "Хүргэгдсэн"
        ];

        const currentIndex = list.indexOf(o.status);
        patch.status =
          list[Math.min(currentIndex + 1, list.length - 1)];
      }

      await sb(`orders?id=eq.${encodeURIComponent(b.id)}`, {
        method: "PATCH",
        headers: {
          "Prefer": "return=minimal"
        },
        body: JSON.stringify(patch)
      });

      return j(200, { ok: true });
    }

    return j(404, { error: "Үйлдэл олдсонгүй" });
  } catch (e) {
    console.error(e);
    return j(500, { error: e.message });
  }
};
