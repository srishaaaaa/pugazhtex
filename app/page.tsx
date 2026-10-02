import { redirect } from "next/navigation";

// The root URL is the POS entry point: anyone opening the deployed domain
// should land on the login screen, not the public storefront.
// The storefront itself lives at /store.
export default function Home() {
  redirect("/pos");
}
