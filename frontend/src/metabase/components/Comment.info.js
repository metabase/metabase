import React from "react";
import Comment from "metabase/components/Comment";

export const component = Comment;
export const category = "display";
export const description = `
  A component for displaying a user comment.
`;

const TEXT =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Cras sit amet sagittis dui. Morbi in odio laoreet, finibus erat vitae, sagittis dui. Ut at mauris eget ligula volutpat pellentesque. Integer non faucibus urna. Maecenas faucibus ornare gravida. Aliquam orci tortor, ullamcorper et vehicula accumsan, malesuada in ipsum. Nullam auctor, justo et mattis fringilla, enim ipsum aliquet nunc, quis posuere odio erat in nulla. Suspendisse elementum, est et rutrum volutpat, purus mi placerat odio, sit amet blandit nulla diam at lectus. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Ut ultricies placerat mollis. Curabitur vestibulum semper turpis, id cursus ex dignissim id. Cras efficitur sed ligula ac dictum. Curabitur hendrerit metus eget vestibulum bibendum. Cras nulla arcu, condimentum in rhoncus eu, interdum ut sapien. Cras sed molestie tellus, quis aliquet nunc. Nulla nec est eu est condimentum facilisis sit amet et ex.";

const ACTIONS = [
  { icon: "alert", title: "foo", action: () => alert("foo") },
  { icon: "bar", title: "bar", action: () => {} },
];

export const examples = {
  Default: (
    <Comment
      title="Bobby Tables"
      text={TEXT}
      timestamp={Date.now()}
      actions={ACTIONS}
    />
  ),
  "Restrict lines shown by adding a `visibleLines` prop": (
    <Comment
      title="Bobby Tables"
      text={TEXT}
      timestamp={new Date("1995-12-17T03:24:00")}
      visibleLines={3}
    />
  ),
  "Width restricted": (
    <div
      style={{
        width: 300,
        padding: "1rem",
        borderRadius: "10px",
        border: "1px dashed black",
      }}
    >
      <Comment
        title="Bobby Tables"
        text={TEXT}
        timestamp="2010-10-10"
        visibleLines={3}
        actions={ACTIONS}
      />
    </div>
  ),
};
