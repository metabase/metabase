import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import Tooltip from "metabase/core/components/Tooltip";
import styles from "metabase/css/core/animation.module.css";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import { Box } from "metabase/ui";

import { getHasMetabotLogo } from "../../selectors";

import {
  GreetingLogo,
  GreetingMessage,
  GreetingRoot,
} from "./HomeGreeting.styled";

export const HomeGreeting = (): JSX.Element => {
  const user = useSelector(getUser);
  const showLogo = useSelector(getHasMetabotLogo);
  const name = user?.first_name;
  const message = useMemo(() => getMessage(name), [name]);

  return (
    <GreetingRoot>
      {showLogo && (
        <Tooltip
          tooltip={t`Don't tell anyone, but you're my favorite.`}
          placement="bottom"
        >
          <MetabotGreeting />
        </Tooltip>
      )}
      <GreetingMessage data-testid="greeting-message" showLogo={showLogo}>
        {message}
      </GreetingMessage>
    </GreetingRoot>
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

const MetabotGreeting = () => {
  const [buffer, setBuffer] = useState<string[]>([]);
  const [isCooling, setIsCooling] = useState(false);
  const [isCool, setIsCool] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      setBuffer(prevBuffer => {
        const newBuffer = [...prevBuffer, event.key];
        if (newBuffer.length > 10) {
          newBuffer.shift();
        }
        return newBuffer;
      });
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (isCoolEnough(buffer)) {
      setTimeout(() => {
        setIsCooling(true);
      }, 1);
      setTimeout(() => {
        setIsCool(true);
      }, 300);
    }
  }, [buffer]);

  return (
    <Box
      style={{
        position: "relative",
        width: "62px",
        height: "40px",
        marginInlineEnd: "0.5rem",
      }}
    >
      <GreetingLogo
        isCool={isCool}
        className={`${styles.SpinOut} ${isCooling ? styles.SpinOutActive : ""}`}
        variant="cool"
      />
      <GreetingLogo
        isCool={!isCool}
        className={`${styles.SpinOut} ${isCooling ? styles.SpinOutActive : ""}`}
        variant="happy"
      />
    </Box>
  );
};

const isCoolEnough = (buffer: string[]) => {
  const currentBuffer = buffer.join("");
  return (
    currentBuffer ===
    "ArrowUpArrowUpArrowDownArrowDownArrowLeftArrowRightArrowLeftArrowRightba"
  );
};
