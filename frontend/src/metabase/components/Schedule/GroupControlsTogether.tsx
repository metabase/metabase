import { Children, type ReactNode, isValidElement } from "react";

import S from "./Schedule.module.css";
import { combineConsecutiveStrings } from "./utils";

/**
 * Helps impose a CSS grid layout on a dynamically generated series of elements
 *
 * @example
 * Suppose that the function generateElements returns the following JSX:
 *
 *    <>Send <Select /><Select /> on <Select /><Select /></>
 *
 * Then the expression
 *
 *    <GroupControlsTogether>
 *      {generateElements()}
 *    </GroupControlsTogether>
 *
 * will yield the following HTML:
 *
 *   <div>Send</div>
 *   <div><select /><select /></div>
 *   <div>on</div>
 *   <div><select /><select /></div>
 *
 * When a CSS grid layout is applied to this, it looks nice, with text on the
 * left and controls on the right.
 *
 * (For ease of explanation, I've omitted classnames from the HTML, and I'm
 * pretending that a Mantine Select is rendered as <select />.)
 * */
export const GroupControlsTogether = ({
  children,
}: {
  children: ReactNode;
}) => {
  const childNodes: ReactNode[] = Children.toArray(children);
  const groupedNodes: ReactNode[] = [];
  let currentGroup: ReactNode[] = [];

  const compactChildren = combineConsecutiveStrings(childNodes);

  compactChildren.forEach((child, index) => {
    if (isValidElement(child)) {
      currentGroup.push(child);

      if (!isValidElement(compactChildren[index + 1])) {
        // Flush current group
        groupedNodes.push(
          <div className={S.ControlGroup} key={`node-${index}`}>
            {currentGroup}
          </div>,
        );
        currentGroup = [];
      }
    } else {
      // Since child is not an element, it should be a string
      if (typeof child !== "string") {
        throw new TypeError();
      }

      if (!child.trim()) {
        return;
      }

      const isTextLong = child.length > 20;
      const isTextNodeLast = index === compactChildren.length - 1;
      const className =
        isTextLong || isTextNodeLast
          ? S.TextInSecondColumn
          : S.TextInFirstColumn;
      groupedNodes.push(
        <div className={className} key={`node-${index}`}>
          {child}
        </div>,
      );
    }
  });

  return <>{groupedNodes}</>;
};
