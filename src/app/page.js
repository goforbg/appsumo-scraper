"use client";

import { useState } from "react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        throw new Error("Scraping failed");
      }

      const data = await response.json();
      setResult(data);
    } catch (error) {
      console.error("Error:", error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl mb-4">AppSumo Product Scraper</h1>
      <form onSubmit={handleSubmit} className="mb-4">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Enter product URL"
          className="border p-2 mr-2 w-full md:w-1/2"
          required
        />
        <button
          type="submit"
          className="bg-blue-500 text-white p-2 mt-2 md:mt-0"
          disabled={loading}
        >
          {loading ? "Scraping..." : "Scrape"}
        </button>
      </form>
      {error && <div className="text-red-500 mb-4">Error: {error}</div>}
      {result && (
        <div>
          <h2 className="text-xl mb-2">Result:</h2>
          <pre className="bg-gray-100 p-4 rounded overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
