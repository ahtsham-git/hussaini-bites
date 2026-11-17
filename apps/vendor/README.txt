Put these four files in THIS folder (apps/vendor/) once, while you have internet.
The app then works offline on the phone. If a file is missing, the app falls back to the internet
copy, so nothing breaks, but offline use will not work.

1. react.production.min.js
   https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js
2. react-dom.production.min.js
   https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js
3. htm.umd.js
   https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js
4. supabase-js.esm.js   (save the browser link's content under this name)
   https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm

Tip: open each link in Chrome, press Ctrl+S (or right-click > Save as), and choose the file name above.
