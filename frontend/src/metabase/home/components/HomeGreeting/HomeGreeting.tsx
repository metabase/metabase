import { useEffect, useMemo, useState } from "react";
import { t } from "ttag";
import _ from "underscore";

import styles from "metabase/css/core/animation.module.css";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import { Flex, Tooltip } from "metabase/ui";

import { getHasMetabotLogo } from "../../selectors";

import {
  GreetingLogo,
  GreetingLogoContainer,
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
      <Flex w="640" ml="auto" mr="auto" align="center" mt="xxl">
        <Beaker />
        <GreetingMessage data-testid="greeting-message" showLogo={showLogo}>
          {message}
        </GreetingMessage>
      </Flex>
    </GreetingRoot>
  );
};

const Beaker = () => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width="36"
      height="36"
    >
      <path
        d="M 5.5 9 L 5.5 11 C 5.5 11.8 6.2 12.5 7 12.5 L 9 12.5 C 9.8 12.5 10.5 11.8 10.5 11 L 10.5 9 Z"
        fill="currentcolor"
      />

      <path
        d="M 5 4 L 5 11 C 5 12.1 6 13 7 13 L 9 13 C 10 13 11 12.1 11 11 L 11 4"
        fill="none"
        stroke="currentcolor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />

      <line
        x1="4"
        y1="4"
        x2="12"
        y2="4"
        stroke="currentcolor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />

      <circle
        className={`${styles.bubble} ${styles.bubble1}`}
        cx="7"
        cy="8"
        r="0.8"
        fill="none"
        stroke="currentcolor"
        strokeWidth="1"
      />
      <circle
        className={`${styles.bubble} ${styles.bubble2}`}
        cx="9"
        cy="8.5"
        r="0.8"
        fill="none"
        stroke="currentcolor"
        strokeWidth="1"
      />
      <circle
        className={`${styles.bubble} ${styles.bubble3}`}
        cx="8"
        cy="7.5"
        r="0.6"
        fill="none"
        stroke="currentcolor"
        strokeWidth="1"
      />
    </svg>
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
      setBuffer((prevBuffer) => {
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
    <Tooltip
      label={t`Don't tell anyone, but you're my favorite.`}
      position="bottom"
    >
      <GreetingLogoContainer>
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
      </GreetingLogoContainer>
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
