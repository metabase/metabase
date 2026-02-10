import { action } from "storybook/actions";

import { UpsellCta } from "./UpsellCta";

export default {
  title: "Patterns/Upsells/UpsellCta",
  component: UpsellCta,
};

export const CtaButton = () => (
  <UpsellCta
    onClick={action("clicked")}
    internalLink={undefined}
    buttonText="Try it now"
    url={undefined}
    onClickCapture={() => {}}
  />
);

export const CtaButtonLarge = () => (
  <UpsellCta
    onClick={action("clicked")}
    internalLink={undefined}
    buttonText="Try it now"
    url={undefined}
    onClickCapture={() => {}}
    size="large"
  />
);

export const CtaExternalLink = () => (
  <UpsellCta
    onClick={undefined}
    url="https://store.metabase.com"
    internalLink={undefined}
    buttonText="Try it now"
    onClickCapture={() => {}}
  />
);

export const CtaInternalLink = () => (
  <UpsellCta
    onClick={undefined}
    internalLink="/admin/settings/embed"
    buttonText="Try it now"
    url={undefined}
    onClickCapture={() => {}}
  />
);
