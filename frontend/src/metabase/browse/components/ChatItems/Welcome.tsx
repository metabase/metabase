import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import { Icon } from "metabase/ui";

export const ChatGreeting = (): JSX.Element => {
  const user = useSelector(getUser);
  const name = user?.first_name;
  const message = useMemo(() => "Talk data to me", []);
  const subMessage = useMemo(
    () => "What would you like to create? Here are some suggestions",
    [],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "1rem",
      }}
    >
      <Icon size={64} name="chat" />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <div
          style={{
            fontSize: "28px",
            color: "#5B26D3",
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
