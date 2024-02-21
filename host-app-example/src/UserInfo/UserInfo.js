import {useCurrentUser} from "metabase-embedding-sdk";

import "./UserInfo.css"

export const UserInfo = () => {
    const user = useCurrentUser()
    return (
        <div className="UserInfo--container">
            <span className="tw-text-right">
                Hello,
                <span className="tw-font-bold"> {user?.common_name}</span>
            </span>
            <span className="UserInfo--email">{user?.email}</span>
        </div>
    )
}