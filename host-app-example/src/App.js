import {useState} from "react";
import {MetabaseProvider} from "metabase-embedding-sdk";

import {SetUserDataHeader} from "./SetUserDataHeader";
import {Page} from "./Page";
import "./App.css";
import {LogoutButton} from "./Logout";

function App() {
    const [font, setFont] = useState("Oswald");

    return (
        <div className="App-container">
            <div className="App-header">
                <SetUserDataHeader
                    font={font}
                    setFont={setFont}
                />
                <LogoutButton/>
            </div>

            <MetabaseProvider
                apiUrl={"http://localhost:3000"}
                font={font}
            >
                <div className="App-body">
                    <Page/>
                </div>
            </MetabaseProvider>
        </div>
    );
}

export default App;
