const SITE = (process.env.TCC_SITE_URL ?? "https://site.tccmc.ir").replace(/\/+$/, "");

export default function Home() {
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "3rem 1.25rem", lineHeight: 2 }}>
      <h1 style={{ fontSize: "1.6rem", marginBottom: ".5rem" }}>🤖 دستیار TCC</h1>
      <p style={{ color: "#a9a3bd" }}>
        ربات تلگرام شبکه‌ی ماینکرفت TCC — وضعیت زنده‌ی سرور، گزارش فروش، ابزارهای تیم و پاسخ‌گویی هوشمند.
      </p>
      <ul style={{ color: "#a9a3bd" }}>
        <li>وضعیت و مشخصات سرور به‌صورت زنده</li>
        <li>بن/اخراج/پیام همگانی برای تیم (مالک، ادمین، دولوپر)</li>
        <li>گفتگو با دستیار هوشمند با آگاهی از وضعیت لحظه‌ای سرور</li>
        <li>مینی‌اپ تلگرام با نسخه‌ی سبک سایت</li>
      </ul>
      <p>
        <a href={SITE} style={{ color: "#f472b6" }}>
          {SITE}
        </a>
      </p>
    </main>
  );
}
