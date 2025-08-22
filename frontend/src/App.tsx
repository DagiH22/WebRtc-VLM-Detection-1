
import './App.css'


import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Host from "./pages/Host";
import Join from "./pages/Join";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/host" />} />
        <Route path="/host" element={<Host />} />
        <Route path="/join/:roomId" element={<Join />} />
      </Routes>
    </BrowserRouter>
  );
}
