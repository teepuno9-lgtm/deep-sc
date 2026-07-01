export default function App({ Component, pageProps }) {
  return (
    <>
      <style jsx global>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
