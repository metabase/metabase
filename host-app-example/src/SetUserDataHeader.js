export const SetUserDataHeader = ({font, setFont}) =>
    (
        <div className="ChooseParamsHeader-container">
            <div className="Params-container">
                <div>
                    Font:
                    <select
                        className="ChooseQuestion-input"
                        value={font}
                        onChange={e => setFont(e.target.value)}
                    >
                        <option value="Lato">Lato</option>
                        <option value="Oswald">Oswald</option>
                    </select>
                </div>
            </div>

            <div
                className="Button align-self-end"
                style={{
                    fontSize: "0.5rem",
                }}
            >
                I should not have border
            </div>
        </div>
    );
