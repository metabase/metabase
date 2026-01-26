import cx from "classnames";
import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import { MetabotLogo } from "metabase/common/components/MetabotLogo";
import animationStyles from "metabase/css/core/animation.module.css";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import { Flex, Tooltip } from "metabase/ui";

import { getHasMetabotLogo } from "../../selectors";

import S from "./HomeGreeting.module.css";

export const HomeGreeting = (): JSX.Element => {
  const user = useSelector(getUser);
  const showLogo = useSelector(getHasMetabotLogo);
  const name = user?.first_name;
  const message = useMemo(() => getMessage(name), [name]);

  return (
    <Flex align="center">
      {showLogo && <MetabotGreeting />}
      <span
        data-testid="greeting-message"
        className={cx(S.greetingMessage, showLogo ? S.withLogo : S.withoutLogo)}
      >
        {message}
      </span>
    </Flex>
  );
};

const getMessage = (name: string | null | undefined): string => {
  const namePart = name ? `, ${name}` : "";
  const options = [
    t`Hey there${namePart}`,
    t`How's it going${namePart}?`,
    t`Howdy${namePart}`,
    t`Greetings${namePart}`,
    t`Good to see you${namePart}`,
  ];

  return _.sample(options) ?? "";
};

export const MetabotGreeting = () => {
  const [buffer, setBuffer] = useState<string[]>([]);
  const [isCooling, setIsCooling] = useState(false);
  const [isCool, setIsCool] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      setBuffer((prevBuffer) => [...prevBuffer, event.key].slice(-10));
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (isCoolEnough(buffer)) {
      setTimeout(() => setIsCooling(true), 1);
      setTimeout(() => setIsCool(true), 300);
    }
  }, [buffer]);

  return (
    <Tooltip
      label={t`Don't tell anyone, but you're my favorite.`}
      position="bottom"
    >
      <div className={S.greetingLogoContainer}>
        <MetabotLogo
          className={cx(S.greetingLogo, animationStyles.SpinOut, {
            [S.isCool]: isCool,
            [S.isNotCool]: !isCool,
            [animationStyles.SpinOutActive]: isCooling,
          })}
          variant="cool"
        />
        <MetabotLogo
          className={cx(S.greetingLogo, animationStyles.SpinOut, {
            [S.isCool]: !isCool,
            [S.isNotCool]: isCool,
            [animationStyles.SpinOutActive]: isCooling,
          })}
          variant="happy"
        />
      </div>
    </Tooltip>
  );
};

const isCoolEnough = (buffer: string[]) => {
  const currentBuffer = buffer.join("");
  return (
    currentBuffer ===
    "ArrowUpArrowUpArrowDownArrowDownArrowLeftArrowRightArrowLeftArrowRightba"
  );
};
