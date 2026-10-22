import {
  PROTOTYPE_FLAGS,
  type PrototypeFlag,
  setPrototypeFlag,
  usePrototypeFlag,
} from "metabase/utils/prototype-flags";

import S from "./PrototypeFlagsToggle.module.css";

const FlagSwitch = ({
  flag,
  label,
}: {
  flag: PrototypeFlag;
  label: string;
}) => {
  const isEnabled = usePrototypeFlag(flag);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isEnabled}
      className={S.flag}
      data-enabled={isEnabled}
      onClick={() => setPrototypeFlag(flag, !isEnabled)}
    >
      <span className={S.label}>{label}</span>
      <span className={S.track}>
        <span className={S.thumb} />
      </span>
    </button>
  );
};

/** Debug pill, pinned to the bottom left of every page, for prototype flags. */
export const PrototypeFlagsToggle = () => (
  <div className={S.root} aria-label="Prototype flags">
    <span className={S.badge}>
      <span className={S.pulse} />
      {"proto"}
    </span>
    {PROTOTYPE_FLAGS.map(({ key, label }) => (
      <FlagSwitch key={key} flag={key} label={label} />
    ))}
  </div>
);
