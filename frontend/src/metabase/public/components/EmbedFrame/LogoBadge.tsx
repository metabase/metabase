import { jt } from "ttag";
import LogoIcon from "metabase/components/LogoIcon";
import type { Variant } from "./LogoBadge.styled";
import { MetabaseLink, MetabaseName, Message } from "./LogoBadge.styled";

function LogoBadge({
  dark,
  variant = "default",
}: {
  dark: boolean;
  variant?: Variant;
}) {
  const logoSize = variant === "large" ? 42 : 28;
  const Metabase = (
    <MetabaseName key="metabase" isDark={dark} variant={variant}>
      Metabase
    </MetabaseName>
  );
  return (
    <MetabaseLink
      href="https://metabase.com/"
      target="_blank"
      variant={variant}
    >
      <LogoIcon height={logoSize} dark={dark} />
      <Message variant={variant}>{jt`Powered by ${Metabase}`}</Message>
    </MetabaseLink>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default LogoBadge;
