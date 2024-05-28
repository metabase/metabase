// I think it's very likely that this is a dead codepath: RL 2023-06-21
import { color } from "metabase/lib/colors";

import { ContextContainer, ContextText } from "./Context.styled";

export function Context({ context }: { context: any[] }) {
  if (!context) {
    return null;
  }

  return (
    <ContextContainer>
      <ContextText>
        {context.map(({ is_match, text }, i: number) => {
          if (!is_match) {
            return <span key={i}> {text}</span>;
          }

          return (
            <strong key={i} style={{ color: color("brand") }}>
              {" "}
              {text}
            </strong>
          );
        })}
      </ContextText>
    </ContextContainer>
  );
}
