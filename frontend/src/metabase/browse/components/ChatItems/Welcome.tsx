import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import { Icon } from "metabase/ui";

export const ChatGreeting = (): JSX.Element => {
  const user = useSelector(getUser);
  const name = user?.first_name;
  const message = useMemo(() => getMessage(name), [name]);
  const subMessage = useMemo(() => "What would you like to create?", []);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
      }}
    >
      <Icon size={64} name="chatBot" />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        <div
          style={{
            fontSize: "28px",
            color: "#0458DD",
            fontWeight: "bolder",
          }}
        >
          {message}
        </div>
        <div
          style={{
            fontSize: "16px",
            color: "#5D6064",
          }}
        >
          {subMessage}
        </div>
      </div>
    </div>
  );
};

const getMessage = (name: string | null | undefined): string => {
  const namePart = name ? `, ${name}` : "";
  const options = [t`Welcome${namePart}`];
  return _.sample(options) ?? "";
};
