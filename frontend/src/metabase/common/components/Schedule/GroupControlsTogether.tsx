import { Children, type ReactNode, isValidElement } from "react";

import { Text } from "metabase/ui";

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
 *
 * Customization:
 *
 * If you need to break the default layout flow, the following
 * hatches are available:
 * - [data-group="separate"] – providing this attribute will cause the component
 *   to be placed in its own group (when otherwise it would've been grouped with
 *   the previous component).
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

  for (let index = 0; index < compactChildren.length; index++) {
    const child = compactChildren[index];
    if (isValidElement(child)) {
      currentGroup.push(child);

      const nextIndex = index + 1;
      const nextChild = compactChildren[nextIndex];
      if (!isValidElement(nextChild)) {
        // If next child is the last string, add it to the current group
        // to prevent it from being left hanging on the last line.
        if (nextIndex === compactChildren.length - 1) {
          if (typeof nextChild === "string" && !!nextChild.trim()) {
            currentGroup.push(
              <Text key={`node-${nextIndex}`} ml="0.5rem">
                {nextChild}
              </Text>,
            );
          }
          groupedNodes.push(
            <div className={S.ControlGroup} key={`node-${index}`}>
              {currentGroup}
            </div>,
          );
          break;
        }
        // Flush current group
        groupedNodes.push(
          <div className={S.ControlGroup} key={`node-${index}`}>
            {currentGroup}
          </div>,
        );
        currentGroup = [];
      } else if (
        nextChild.props?.["data-group"] === GROUP_ATTRIBUTES.separate
      ) {
        // If the next child has a "separate" attribute, break the current group cycle
        // and start a new one
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
  }

  return <>{groupedNodes}</>;
};

export const GROUP_ATTRIBUTES = {
  separate: "separate",
};
