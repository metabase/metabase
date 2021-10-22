import React from "react";

import ClampedText from "metabase/components/ClampedText";

export const component = ClampedText;
export const category = "display";
export const description = `
Shows a set number of lines for a variable-length string
`;

const text =
  "Lorem ipsum \n \n dolor sit amet, consectetur adipiscing elit. Cras sit amet sagittis dui. Morbi in odio laoreet, finibus erat vitae, sagittis dui. Ut at mauris eget ligula volutpat pellentesque. Integer non faucibus urna. Maecenas faucibus ornare gravida. Aliquam orci tortor, ullamcorper et vehicula accumsan, malesuada in ipsum. Nullam auctor, justo et mattis fringilla, enim ipsum aliquet nunc, quis posuere odio erat in nulla. Suspendisse elementum, est et rutrum volutpat, purus mi placerat odio, sit amet blandit nulla diam at lectus. Orci varius natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Ut ultricies placerat mollis. Curabitur vestibulum semper turpis, id cursus ex dignissim id. Cras efficitur sed ligula ac dictum. Curabitur hendrerit metus eget vestibulum bibendum. Cras nulla arcu, condimentum in rhoncus eu, interdum ut sapien. Cras sed molestie tellus, quis aliquet nunc. Nulla nec est eu est condimentum facilisis sit amet et ex.";

export const examples = {
  Default: <ClampedText text={text} visibleLines={3} />,
  "No 'See more' button when all text visible": (
    <React.Fragment>
      <strong>A single line of text:</strong>
      <ClampedText text="foo" visibleLines={3} />
      <br />
      <strong>Many lines of text, but an unset `visibleLines` prop:</strong>
      <ClampedText text={text} />
    </React.Fragment>
  ),
};
