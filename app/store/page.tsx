import { MapPin, Clock, Phone, Store, Scissors, Camera, Mail, User } from "lucide-react";
import { getShopSettings, shopLogoSrc, instagramHandle } from "@/lib/shopSettings";

export const dynamic = "force-dynamic";

export default async function Home() {
  const shop = await getShopSettings();
  const logo = shopLogoSrc(shop);
  const contactRows = [
    { Icon: User, label: "Proprietor", value: shop.owner_name },
    { Icon: Phone, label: "Phone Numbers", value: shop.phone },
    { Icon: Mail, label: "Email", value: shop.email },
  ].filter((row) => Boolean(row.value));

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#1A1A1A] font-sans flex flex-col justify-between selection:bg-[var(--accent)] selection:text-white">
      {/* Header */}
      <header className="border-b border-black/10 py-6 px-6 sm:px-12 flex justify-center items-center bg-white/90 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-xs border border-[var(--accent)]/30">
            <img src={logo} alt={`${shop.shop_name} Logo`} className="w-full h-full object-cover" />
          </div>
          <div>
            <span className="text-sm font-black text-[var(--accent)] tracking-wider uppercase block">
              {shop.shop_name}
            </span>
            <span className="text-[9px] text-[var(--accent-strong)] font-bold tracking-widest block uppercase -mt-0.5">
              {shop.tagline}
            </span>
          </div>
        </div>
      </header>

      {/* Main Info */}
      <main className="flex-1 max-w-xl mx-auto w-full px-6 flex flex-col justify-center items-center py-16">
        <div className="bg-white border border-[var(--accent)]/30 rounded-2xl p-8 sm:p-12 shadow-md w-full text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[var(--accent)] via-[var(--accent-strong)] to-[var(--accent)]" />

          <span className="inline-block px-3 py-1 bg-[var(--accent)]/10 border border-[var(--accent)]/30 text-[var(--accent)] text-[10px] font-bold rounded-full tracking-wider uppercase mb-6">
            Store Directory & Contacts
          </span>

          <h1 className="text-3xl font-black text-[var(--accent)] leading-tight tracking-tight mb-2 uppercase">
            {shop.shop_name}
          </h1>
          <p className="text-xs text-[var(--accent-strong)] font-black tracking-widest uppercase mb-8">
            {shop.tagline}
          </p>

          <div className="space-y-6 text-left max-w-md mx-auto text-sm font-semibold text-[#1A1A1A]/80 border-t border-black/10 pt-8">
            {shop.services && (
              <div className="flex items-start gap-4">
                <Scissors className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-black/50 uppercase tracking-wider mb-0.5">What We Offer</p>
                  <p className="text-[#1A1A1A] leading-relaxed">
                    {shop.services}
                  </p>
                </div>
              </div>
            )}

            {shop.location && (
              <div className="flex items-start gap-4">
                <Store className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-black/50 uppercase tracking-wider mb-0.5">Location</p>
                  <p className="text-[#1A1A1A] font-bold">
                    {shop.location}
                  </p>
                </div>
              </div>
            )}

            {shop.address && (
              <div className="flex items-start gap-4">
                <MapPin className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-black/50 uppercase tracking-wider mb-0.5">Address</p>
                  <p className="text-[#1A1A1A] leading-relaxed">
                    {shop.address}
                  </p>
                </div>
              </div>
            )}

            {contactRows.map(({ Icon, label, value }) => (
              <div key={label} className="flex items-start gap-4">
                <Icon className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-black/50 uppercase tracking-wider mb-0.5">{label}</p>
                  <p className="text-[#1A1A1A] break-all">{value}</p>
                </div>
              </div>
            ))}

            {shop.instagram_url && (
              <div className="flex items-start gap-4">
                <Camera className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-[10px] font-bold text-black/50 uppercase tracking-wider mb-0.5">Instagram</p>
                  <a
                    href={shop.instagram_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] font-bold underline underline-offset-2 break-all"
                  >
                    {instagramHandle(shop.instagram_url)}
                  </a>
                </div>
              </div>
            )}

            {shop.business_hours && (
              <div className="flex items-start gap-4">
                <Clock className="w-5 h-5 text-[var(--accent)] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-black/50 uppercase tracking-wider mb-0.5">Business Hours</p>
                  <p className="text-[#1A1A1A]">
                    {shop.business_hours}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-black/10 py-6 text-center bg-white">
        <p className="text-[10px] font-bold text-[var(--accent)] tracking-widest uppercase">
          {shop.shop_name}{shop.tagline ? ` • ${shop.tagline}` : ""}
        </p>
        <p className="text-[9px] font-semibold text-black/40 uppercase tracking-wider mt-1">
          © {new Date().getFullYear()} {shop.owner_name} All Rights Reserved • Powered by Cenexa Systems
        </p>
      </footer>
    </div>
  );
}
