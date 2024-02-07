import {useState} from "react"
import { useNavigate } from 'react-router-dom'

export const SignIn = () => {
    const [authError, setAuthError] = useState(null);
    const navigate = useNavigate()

    const onSubmit = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);

        return fetch("http://localhost:8081/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                email: formData.get("email"),
                password: formData.get("password")
            }),
            credentials: "include",
        })
            .then((response) => {
                console.log(response)
                if (response.status === 200) {
                    console.log(response.status)
                    navigate("/app")
                } else {
                    setAuthError("invalid")
                }
            })
            .catch((error) => {
                console.error("Error:", error);
            });
    }


    return <div style={{
        display: 'grid',
        placeItems: 'center',
        height: "100vh"
    }}>
        <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "2rem",
            alignItems: "center",
        }}>
            <h1>Sign In</h1>
            <form onSubmit={onSubmit} action="#" style={{
                display: 'flex',
                flexDirection: 'column',
                gap: "1rem",
            }}>
                <div style={{display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: "1rem"}}>
                    <label htmlFor="email">Email</label>
                    <input type="text" name="email" id="email"/>
                </div>
                <div style={{display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: "1rem"}}>
                    <label htmlFor="password">Password</label>
                    <input type="password" name="password" id="password"/>
                </div>

                <button type="submit">Sign In</button>
            </form>

            {authError && <div>Invalid email or password</div>}
        </div>
    </div>
}