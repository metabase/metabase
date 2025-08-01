import { UpsellCta } from "./UpsellCta";

export default {
  title: "Patterns/Upsells/UpsellCta",
  component: UpsellCta,
};

export const CtaButton = () => (
  <UpsellCta
    onClick={() => {}}
    buttonLink=""
    internalLink=""
    buttonText="Try it now"
    url=""
    onClickCapture={() => {}}
  />
);

export const CtaExternalLink = () => (
  <UpsellCta
    onClick={undefined}
    buttonLink="https://store.metabase.com"
    internalLink={undefined}
    buttonText="Try it now"
    url=""
    onClickCapture={() => {}}
  />
);

export const CtaInternalLink = () => (
  <UpsellCta
    onClick={undefined}
    buttonLink={undefined}
    internalLink="/admin/settings/embed"
    buttonText="Try it now"
    url=""
    onClickCapture={() => {}}
  />
);
