import { Banner } from "metabase/common/components/Banner";
import { Markdown } from "metabase/common/components/Markdown";

import S from "./UpgradeBanner.module.css";

export interface UpgradeBannerProps {
  message: string;
}

export function UpgradeBanner({ message }: UpgradeBannerProps) {
  return (
    <Banner
      icon="info"
      bg="background_surface-warning"
      className={S.banner}
      body={<Markdown>{message}</Markdown>}
    />
  );
}
