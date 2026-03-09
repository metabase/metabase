import cx from "classnames";

import S from "./SplitLayout.module.css";

type SplitLayoutProps = {
  renderLeftPinned: () => React.ReactNode;
  renderCenter: () => React.ReactNode;
  height: string;
};

export const SplitLayout = ({
  renderLeftPinned,
  renderCenter,
  height,
}: SplitLayoutProps) => {
  return (
    <div className={cx(S.root)}>
      <div
        style={{
          height: height,
        }}
      >
        {renderLeftPinned()}
      </div>
      <div
        style={{
          height: height,
        }}
        className={cx(S.center)}
      >
        {renderCenter()}
      </div>
    </div>
  );
};
