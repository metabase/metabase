import { useEffect } from "react";
import type { LocationAction } from "react-router-redux";
import { replace } from "react-router-redux";

import { connect } from "metabase/lib/redux";

interface RedirectWidgetProps {
  to: string;
  replace: LocationAction;
}
function RedirectWidget({ to, replace }: RedirectWidgetProps) {
  useEffect(() => {
    replace(to);
  }, [replace, to]);
  return null;
}

const mapDispatchToProps = {
  replace,
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(RedirectWidget);
