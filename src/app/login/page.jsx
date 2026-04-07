'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const router = useRouter();

  const handleLogin = (e) => {
    e.preventDefault();
    // Logika login sederhana sesuai permintaan
    if (username === 'admin' && password === 'OOPSv1') {
      // Simpan status login di local storage (sederhana)
      localStorage.setItem('isAdmin', 'true');
      router.push('/admin');
    } else {
      alert('Username atau Password salah!');
    }
  };

  return (
    <div className="container d-flex justify-content-center align-items-center vh-100">
      <div className="card p-4 shadow-sm" style={{ maxWidth: '400px', width: '100%', borderRadius: '16px' }}>
        <div className="text-center mb-4">
          <img src="https://i.imgur.com/3ItDqk6.png" alt="Logo" style={{ height: '40px' }} />
          <h4 className="mt-3 fw-bold">Admin Login</h4>
        </div>
        <form onSubmit={handleLogin}>
          <div className="mb-3">
            <label className="form-label small fw-bold">Username</label>
            <input 
              type="text" 
              className="form-control" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required 
            />
          </div>
          <div className="mb-4">
            <label className="form-label small fw-bold">Password</label>
            <input 
              type="password" 
              className="form-control" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required 
            />
          </div>
          <button type="submit" className="btn btn-primary w-100 rounded-pill py-2 fw-bold">
            Masuk ke Dashboard
          </button>
        </form>
        <div className="text-center mt-4">
            <a href="/" className="text-muted small text-decoration-none">
                <i className="bi bi-arrow-left"></i> Kembali ke Form Pesanan
            </a>
        </div>
      </div>
    </div>
  );
}