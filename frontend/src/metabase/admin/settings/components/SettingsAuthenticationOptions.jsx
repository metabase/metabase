import React, { Component } from 'react'
import { Link } from 'react-router'

class SettingsAuthenticationOptions extends Component {
    render () {
        return (
            <ul className="text-measure">
                <li>
                    <div className="bordered rounded shadowed bg-white p4">
                        <h2>Sign in with Google</h2>
                        <p>Allows users with existing Metabase accounts to login with a Google account that matches their email address in addition to their Metabase username and password.</p>
                        <Link className="Button" to="/admin/settings/authentication/google">Configure</Link>
                    </div>
                </li>

                <li className="mt2">
                    <div className="bordered rounded shadowed bg-white p4">
                        <h2>LDAP</h2>
                        <p>Allows users within your LDAP directory to log in to Metabase with their LDAP credentials, and allows automatic mapping of LDAP groups to Metabase groups.</p>
                        <Link className="Button" to="/admin/settings/authentication/ldap">Configure</Link>
                    </div>
                </li>
            </ul>
        )
    }
}

export default SettingsAuthenticationOptions
