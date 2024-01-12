/* eslint-disable react/prop-types */
import { Icon } from "metabase/ui";

const FullscreenIcon = ({ isFullscreen, ...props }) => (
  <Icon name={isFullscreen ? "contract" : "expand"} {...props} />
);

export default FullscreenIcon;
