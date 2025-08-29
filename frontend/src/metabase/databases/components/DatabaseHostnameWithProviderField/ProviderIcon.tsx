import { match } from "ts-pattern";

import { Icon } from "metabase/ui";

import type { DatabaseProviderName } from "./database-providers";
import AivenIcon from "./providers/aiven.svg";
import AmazonRDSIcon from "./providers/amazon-rds.svg";
import AzureIcon from "./providers/azure.svg";
import CrunchyDataIcon from "./providers/crunchy-data.svg";
import DigitalOceanIcon from "./providers/digitalocean.svg";
import FlyIoIcon from "./providers/fly-io.svg";
import NeonIcon from "./providers/neon.svg";
import PlanetScaleIcon from "./providers/planetscale.svg";
import RailwayIcon from "./providers/railway.svg";
import RenderIcon from "./providers/render.svg";
import ScalewayIcon from "./providers/scaleway.svg";
import SupabaseIcon from "./providers/supabase.svg";
import TimescaleIcon from "./providers/timescale.svg";

const ICON_SIZE = 16;

export function ProviderIcon({
  provider,
}: {
  provider: DatabaseProviderName | null;
}) {
  if (!provider) {
    return (
      <Icon
        name="database"
        size={ICON_SIZE}
        color="icon-primary"
        opacity={0.25}
      />
    );
  }

  const image = match(provider)
    .with("Aiven", () => AivenIcon)
    .with("Amazon RDS", () => AmazonRDSIcon)
    .with("Azure", () => AzureIcon)
    .with("Crunchy Data", () => CrunchyDataIcon)
    .with("DigitalOcean", () => DigitalOceanIcon)
    .with("Fly.io", () => FlyIoIcon)
    .with("Neon", () => NeonIcon)
    .with("Render", () => RenderIcon)
    .with("Railway", () => RailwayIcon)
    .with("PlanetScale", () => PlanetScaleIcon)
    .with("Scaleway", () => ScalewayIcon)
    .with("Supabase", () => SupabaseIcon)
    .with("Timescale", () => TimescaleIcon)
    .exhaustive();

  return <img src={image} width={ICON_SIZE} height={ICON_SIZE} alt="" />;
}
