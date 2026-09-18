const SUPABASE_URL =
  "https://kupgmkfmexbmjugwidvj.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_PzTWM9er2odzzVgCM0EFnQ_zCZlbCYB";

const db = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const app = document.getElementById("app");

const params = new URLSearchParams(window.location.search);
const id = params.get("m") || "demo";


async function loadMemory() {

  app.innerHTML = "<p>Đang mở kỷ niệm...</p>";

  const { data, error } = await db
    .from("memories")
    .select("*")
    .eq("id", id)
    .single();


  if (error || !data) {

    console.error(error);

    app.innerHTML =
      "<p>Memory không tồn tại.</p>";

    return;
  }


  document.title =
    (data.title || "Memory") + " · Memory";


  const photos = (data.photo_paths || []).map(path => {

    // Nếu trong database đã là URL đầy đủ
    if (path.startsWith("http")) {
      return path;
    }

    // Nếu database chỉ lưu filename/path
    const { data: publicData } = db.storage
      .from("memory-photos")
      .getPublicUrl(path);

    return publicData.publicUrl;

  });


  const created = data.created_at
    ? new Date(data.created_at)
    : null;


  const dateText = created
    ? created.toLocaleDateString(
        "vi-VN",
        {
          day: "2-digit",
          month: "2-digit",
          year: "numeric"
        }
      )
    : "";


  app.innerHTML = `

    <section class="hero">

      <small>A PRIVATE LITTLE GALLERY</small>

      <h1>${data.title || "Memory"}</h1>

      <div class="date">
        ${dateText}
      </div>

      <div class="message">
        ${data.message || ""}
      </div>

    </section>


    <section class="gallery">

      ${photos.map((url, i) => `

        <img
          src="${url}"
          alt="Memory ${i + 1}"
          loading="lazy"
        >

      `).join("")}

    </section>

  `;

}


loadMemory();
