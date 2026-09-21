import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TCC Bot",
  description: "دستیار تلگرام شبکه‌ی ماینکرفت TCC",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body style={{ margin: 0, background: "#0a0812", color: "#ece9f4", fontFamily: "system-ui, Tahoma, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
