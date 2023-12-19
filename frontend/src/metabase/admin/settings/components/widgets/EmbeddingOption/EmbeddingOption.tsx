import { Link } from "react-router";
import { t } from "ttag";
import ExternalLink from "metabase/core/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";
import { Button, Flex, Text, Title } from "metabase/ui";
import { Label, StyledCard } from "./EmbeddingOption.styled";
import InteractiveEmbeddingOff from "./InteractiveEmbeddingOff.svg?component";
import InteractiveEmbeddingOn from "./InteractiveEmbeddingOn.svg?component";
import StaticEmbeddingOff from "./StaticEmbeddingOff.svg?component";
import StaticEmbeddingOn from "./StaticEmbeddingOn.svg?component";
interface EmbeddingOptionProps {
  setting: {
    embedName: string;
    embedDescription: string;
    embedType: "standalone" | "full-app";
  };
}

const interactiveEmbedQuickStartOSSLink =
  "https://www.metabase.com/learn/customer-facing-analytics/interactive-embedding-quick-start?utm_source=product&utm_medium=CTA&utm_campaign=embed-settings-oss-cta";

const interactiveEmbedQuickStartEELink =
  "https://www.metabase.com/learn/customer-facing-analytics/interactive-embedding-quick-start?utm_source=product&utm_medium=CTA&utm_campaign=embed-settings-ee-cta";

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function EmbeddingOption({ setting }: EmbeddingOptionProps) {
  const settingValue = useSelector(state =>
    getSetting(state, "enable-embedding"),
  );

  const Icon = Icons[setting.embedType][settingValue ? "on" : "off"];

  return (
    <StyledCard compact>
      <Icon />
      <Flex gap="md" my="md" direction={"row"}>
        <Title order={2}>{setting.embedName}</Title>
        {setting.embedType === "full-app" && <Label>{t`PRO/ENTERPRISE`}</Label>}
      </Flex>
      <Text mb={"lg"}>{setting.embedDescription}</Text>
      <Flex gap="md" direction="column" align="flex-start">
        {setting.embedType === "standalone" ? (
          <StaticEmbeddingButtons enabled={settingValue} />
        ) : (
          <InteractiveEmbeddingButtons enabled={settingValue} />
        )}
      </Flex>
    </StyledCard>
  );
}

const StaticEmbeddingButtons = ({ enabled }: { enabled: boolean }) => {
  return (
    <>
      <Button
        variant="default"
        disabled={!enabled}
        component={Link}
        to={"/admin/settings/embedding-in-other-applications/standalone"}
      >
        {t`Manage`}
      </Button>
    </>
  );
};

const InteractiveEmbeddingButtons = ({ enabled }: { enabled: boolean }) => {
  const isEE = PLUGIN_EMBEDDING.isEnabled();

  return (
    <>
      <ExternalLink
        href={
          isEE
            ? interactiveEmbedQuickStartEELink
            : interactiveEmbedQuickStartOSSLink
        }
      >
        {t`Check out our Quick Start`}
      </ExternalLink>
      {isEE ? (
        <Button
          component={Link}
          to={"/admin/settings/embedding-in-other-applications/full-app"}
          disabled={!enabled}
        >
          {t`Configure`}
        </Button>
      ) : (
        <Button
          component={ExternalLink}
          href="https://www.metabase.com/product/embedded-analytics?utm_source=product&utm_medium=CTA&utm_campaign=embed-settings-oss-cta"
        >
          {t`Learn More`}
        </Button>
      )}
    </>
  );
};

const Icons = {
  standalone: {
    on: StaticEmbeddingOn,
    off: StaticEmbeddingOff,
  },
  "full-app": {
    on: InteractiveEmbeddingOn,
    off: InteractiveEmbeddingOff,
  },
} as const;
