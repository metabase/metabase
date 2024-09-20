import { useMemo } from "react";
import _ from "underscore";
import { useSelector } from "metabase/lib/redux";
import { getUser } from "metabase/selectors/user";
import { Icon } from "metabase/ui";
import { t } from "ttag";

export const ChatGreeting = ({ chatType }: any): JSX.Element => {
  const user = useSelector(getUser);
  const name = user?.first_name;
  const subMessage = useMemo(
    () => t`What would you like to create? Here are some suggestions`,
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
      {chatType === "insights" ? (
        <Icon size={64} name="lightbulb" color="#8A64DF" />
      ) : (
        <Icon size={64} name="chat" color="#8A64DF" />
      )}
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
          {chatType === "insights"
            ? t`Generate insights for me`
            : t`Talk data to me`}
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
