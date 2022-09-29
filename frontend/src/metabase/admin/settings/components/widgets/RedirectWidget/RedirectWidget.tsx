import { useEffect } from "react";
import { connect } from "react-redux";
import { LocationAction, replace } from "react-router-redux";

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

export default connect(null, mapDispatchToProps)(RedirectWidget);
