import React, { PropTypes } from "react";
import { Link } from "react-router";
import cx from "classnames";

import Icon from "metabase/components/Icon.jsx";

const EmptyState = ({ title, message, icon, image, action, link, onActionClick, style = "", logoClassName = ""}) =>
    <div className="text-centered text-brand-light my2">
        { title &&
            <h2 className="text-brand mb4">{title}</h2>
        }
        { icon &&
            <Icon name={icon} size={40} className={logoClassName} />
        }
        { image &&
            <img src={`${image}.png`} height="250px" alt={message} srcSet={`${image}@2x.png 2x`} className={logoClassName} />
        }
        <div className="flex justify-center">
            <h3 className="text-grey-2 mt4" style={{lineHeight: "1.5em"}}>{message}</h3>
        </div>
        { action && link &&
            <Link to={link} className="Button Button--primary mt3" target={link.startsWith('http') ? "_blank" : ""}>{action}</Link>
        }
        { action && onActionClick &&
            <a onClick={onActionClick} className="Button Button--primary mt3">{action}</a>
        }
    </div>

EmptyState.propTypes = {
    title:         PropTypes.string,
    message:       PropTypes.string.isRequired,
    icon:          PropTypes.string,
    image:         PropTypes.string,
    action:        PropTypes.string,
    link:          PropTypes.string,
    onActionClick: PropTypes.func,
    logoClassName: PropTypes.string
};

export default EmptyState;
