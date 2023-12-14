import { t } from "ttag";
import { Link } from "react-router";
import { Flex } from "metabase/ui";
import { useSelector } from "metabase/lib/redux";
import { getSetting } from "metabase/selectors/settings";
import {
  Description,
  Header,
  Label,
  StyledCard,
} from "./EmbeddingOption.styled";
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default function EmbeddingOption({ setting }: EmbeddingOptionProps) {
  const settingValue = useSelector(state =>
    getSetting(state, "enable-embedding"),
  );

  const Icon = Icons[setting.embedType][settingValue ? "on" : "off"];

  return (
    <Link
      to={`/admin/settings/embedding-in-other-applications/${setting.embedType}`}
    >
      <StyledCard compact>
        <Icon />
        <Flex gap="md" direction={"row"}>
          <Header>{setting.embedName}</Header>
          {setting.embedType === "full-app" && (
            <Label>{t`PRO/ENTERPRISE`}</Label>
          )}
        </Flex>
        <Description>{setting.embedDescription}</Description>
      </StyledCard>
    </Link>
  );
}

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
