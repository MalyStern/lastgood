// Localised chrome. Finding text stays English (it's what people paste into a
// search box or an AI; commands are language-neutral). Auto-detected from LANG,
// English fallback per key.

export interface Dict {
  reportTitle: string
  lastWorked: string
  clean: string
  readyRun: string
  hasBlocking: string
  hasLikely: string
  fix: string
  run: string
  sevBlocking: string
  sevLikely: string
  sevNice: string
  sevInfo: string
  summary: string // {b} {l} {n}
  runThis: string
  marked: string
  noFingerprint: string
}

const en: Dict = {
  reportTitle: 'LastGood — what changed since your project last worked',
  lastWorked: 'Last worked',
  clean: 'Nothing changed since your project last worked.',
  readyRun: 'You\'re good to go.',
  hasBlocking: 'Fix these to get back to a working state.',
  hasLikely: 'A few things drifted — worth a look.',
  fix: 'Fix',
  run: 'Run',
  sevBlocking: 'blocking',
  sevLikely: 'likely',
  sevNice: 'nice to know',
  sevInfo: 'info',
  summary: '{b} blocking · {l} likely · {n} nice',
  runThis: 'Run these to get going:',
  marked: 'Saved the current state as last-good.',
  noFingerprint: 'No last-good state yet. Run `lastgood mark` when the project works.',
}

const DICTS: Record<string, Partial<Dict>> = {
  en,
  es: { reportTitle: 'LastGood — qué cambió desde que tu proyecto funcionaba', lastWorked: 'Funcionó por última vez', clean: 'Nada cambió desde que tu proyecto funcionaba.', readyRun: 'Todo listo.', hasBlocking: 'Corrige esto para volver a un estado funcional.', hasLikely: 'Algunas cosas cambiaron — vale la pena revisar.', fix: 'Solución', run: 'Ejecuta', sevBlocking: 'bloqueante', sevLikely: 'probable', sevNice: 'para saber', sevInfo: 'info', summary: '{b} bloqueantes · {l} probables · {n} menores', runThis: 'Ejecuta esto para empezar:', marked: 'Estado actual guardado como último bueno.', noFingerprint: 'Aún no hay estado bueno. Ejecuta `lastgood mark` cuando funcione.' },
  pt: { reportTitle: 'LastGood — o que mudou desde que o projeto funcionava', lastWorked: 'Funcionou pela última vez', clean: 'Nada mudou desde que o projeto funcionava.', readyRun: 'Tudo pronto.', hasBlocking: 'Corrija isto para voltar a um estado funcional.', hasLikely: 'Algumas coisas mudaram — vale a pena olhar.', fix: 'Correção', run: 'Execute', sevBlocking: 'bloqueador', sevLikely: 'provável', sevNice: 'a saber', sevInfo: 'info', summary: '{b} bloqueadores · {l} prováveis · {n} menores', runThis: 'Execute isto para começar:', marked: 'Estado atual salvo como último bom.', noFingerprint: 'Ainda sem estado bom. Execute `lastgood mark` quando funcionar.' },
  fr: { reportTitle: 'LastGood — ce qui a changé depuis que le projet marchait', lastWorked: 'A marché la dernière fois', clean: 'Rien n’a changé depuis que le projet marchait.', readyRun: 'Tout est bon.', hasBlocking: 'Corrigez ceci pour revenir à un état fonctionnel.', hasLikely: 'Quelques dérives — à vérifier.', fix: 'Correctif', run: 'Exécutez', sevBlocking: 'bloquant', sevLikely: 'probable', sevNice: 'à savoir', sevInfo: 'info', summary: '{b} bloquants · {l} probables · {n} mineurs', runThis: 'Lancez ceci pour démarrer :', marked: 'État actuel enregistré comme dernier bon.', noFingerprint: 'Pas encore d’état bon. Lancez `lastgood mark` quand ça marche.' },
  de: { reportTitle: 'LastGood — was sich seit dem letzten funktionierenden Stand geändert hat', lastWorked: 'Zuletzt lauffähig', clean: 'Seit dem letzten funktionierenden Stand hat sich nichts geändert.', readyRun: 'Alles bereit.', hasBlocking: 'Behebe dies, um wieder lauffähig zu sein.', hasLikely: 'Ein paar Abweichungen — sieh nach.', fix: 'Lösung', run: 'Ausführen', sevBlocking: 'blockierend', sevLikely: 'wahrscheinlich', sevNice: 'zur Info', sevInfo: 'Info', summary: '{b} blockierend · {l} wahrscheinlich · {n} gering', runThis: 'Führe dies aus, um zu starten:', marked: 'Aktuellen Stand als letzten guten gespeichert.', noFingerprint: 'Noch kein guter Stand. Führe `lastgood mark` aus, wenn es läuft.' },
  it: { reportTitle: 'LastGood — cosa è cambiato da quando il progetto funzionava', lastWorked: 'Ultimo funzionamento', clean: 'Niente è cambiato da quando il progetto funzionava.', readyRun: 'Tutto pronto.', hasBlocking: 'Risolvi questo per tornare a uno stato funzionante.', hasLikely: 'Alcune cose sono cambiate — da controllare.', fix: 'Soluzione', run: 'Esegui', sevBlocking: 'bloccante', sevLikely: 'probabile', sevNice: 'da sapere', sevInfo: 'info', summary: '{b} bloccanti · {l} probabili · {n} minori', runThis: 'Esegui questo per iniziare:', marked: 'Stato attuale salvato come ultimo valido.', noFingerprint: 'Nessuno stato valido. Esegui `lastgood mark` quando funziona.' },
  ru: { reportTitle: 'LastGood — что изменилось с момента, когда проект работал', lastWorked: 'Последний рабочий момент', clean: 'Ничего не изменилось с момента, когда проект работал.', readyRun: 'Можно продолжать.', hasBlocking: 'Исправьте это, чтобы вернуться к рабочему состоянию.', hasLikely: 'Кое-что изменилось — стоит взглянуть.', fix: 'Исправление', run: 'Выполните', sevBlocking: 'блокирует', sevLikely: 'вероятно', sevNice: 'к сведению', sevInfo: 'инфо', summary: '{b} блокирующих · {l} вероятных · {n} прочих', runThis: 'Выполните это, чтобы начать:', marked: 'Текущее состояние сохранено как рабочее.', noFingerprint: 'Рабочего состояния ещё нет. Выполните `lastgood mark`, когда всё работает.' },
  uk: { reportTitle: 'LastGood — що змінилося відколи проєкт працював', lastWorked: 'Востаннє працював', clean: 'Нічого не змінилося відколи проєкт працював.', readyRun: 'Можна продовжувати.', hasBlocking: 'Виправте це, щоб повернутися до робочого стану.', hasLikely: 'Дещо змінилося — варто глянути.', fix: 'Виправлення', run: 'Виконайте', sevBlocking: 'блокує', sevLikely: 'імовірно', sevNice: 'до відома', sevInfo: 'інфо', summary: '{b} блокувальних · {l} імовірних · {n} інших', runThis: 'Виконайте це, щоб почати:', marked: 'Поточний стан збережено як робочий.', noFingerprint: 'Робочого стану ще немає. Виконайте `lastgood mark`, коли працює.' },
  pl: { reportTitle: 'LastGood — co się zmieniło odkąd projekt działał', lastWorked: 'Ostatnio działał', clean: 'Nic się nie zmieniło odkąd projekt działał.', readyRun: 'Można działać.', hasBlocking: 'Napraw to, aby wrócić do działającego stanu.', hasLikely: 'Kilka rzeczy się zmieniło — warto sprawdzić.', fix: 'Naprawa', run: 'Uruchom', sevBlocking: 'blokujące', sevLikely: 'prawdopodobne', sevNice: 'do wiadomości', sevInfo: 'info', summary: '{b} blokujące · {l} prawdopodobne · {n} drobne', runThis: 'Uruchom to, aby zacząć:', marked: 'Zapisano bieżący stan jako ostatni dobry.', noFingerprint: 'Brak dobrego stanu. Uruchom `lastgood mark`, gdy działa.' },
  nl: { reportTitle: 'LastGood — wat er veranderde sinds je project werkte', lastWorked: 'Laatst werkend', clean: 'Er is niets veranderd sinds je project werkte.', readyRun: 'Je kunt aan de slag.', hasBlocking: 'Los dit op om terug te keren naar een werkende staat.', hasLikely: 'Een paar dingen zijn veranderd — bekijk het.', fix: 'Oplossing', run: 'Voer uit', sevBlocking: 'blokkerend', sevLikely: 'waarschijnlijk', sevNice: 'ter info', sevInfo: 'info', summary: '{b} blokkerend · {l} waarschijnlijk · {n} klein', runThis: 'Voer dit uit om te starten:', marked: 'Huidige staat opgeslagen als laatst werkend.', noFingerprint: 'Nog geen werkende staat. Voer `lastgood mark` uit als het werkt.' },
  tr: { reportTitle: 'LastGood — projen en son çalıştığından beri ne değişti', lastWorked: 'En son çalıştı', clean: 'Projen en son çalıştığından beri hiçbir şey değişmedi.', readyRun: 'Hazırsın.', hasBlocking: 'Çalışır duruma dönmek için bunları düzelt.', hasLikely: 'Birkaç şey değişmiş — bir bak.', fix: 'Çözüm', run: 'Çalıştır', sevBlocking: 'engelleyici', sevLikely: 'olası', sevNice: 'bilgi amaçlı', sevInfo: 'bilgi', summary: '{b} engelleyici · {l} olası · {n} küçük', runThis: 'Başlamak için şunları çalıştır:', marked: 'Mevcut durum son iyi olarak kaydedildi.', noFingerprint: 'Henüz iyi durum yok. Çalıştığında `lastgood mark` çalıştır.' },
  id: { reportTitle: 'LastGood — apa yang berubah sejak proyekmu terakhir bekerja', lastWorked: 'Terakhir bekerja', clean: 'Tidak ada yang berubah sejak proyekmu terakhir bekerja.', readyRun: 'Kamu siap jalan.', hasBlocking: 'Perbaiki ini untuk kembali ke keadaan bekerja.', hasLikely: 'Beberapa hal berubah — perlu dilihat.', fix: 'Perbaikan', run: 'Jalankan', sevBlocking: 'penghambat', sevLikely: 'kemungkinan', sevNice: 'sekadar tahu', sevInfo: 'info', summary: '{b} penghambat · {l} kemungkinan · {n} kecil', runThis: 'Jalankan ini untuk mulai:', marked: 'Keadaan saat ini disimpan sebagai terakhir baik.', noFingerprint: 'Belum ada keadaan baik. Jalankan `lastgood mark` saat berhasil.' },
  vi: { reportTitle: 'LastGood — điều gì đã thay đổi kể từ khi dự án chạy được', lastWorked: 'Lần cuối chạy được', clean: 'Không có gì thay đổi kể từ khi dự án chạy được.', readyRun: 'Bạn có thể bắt đầu.', hasBlocking: 'Sửa những mục này để trở lại trạng thái chạy được.', hasLikely: 'Vài thứ đã thay đổi — nên xem.', fix: 'Cách sửa', run: 'Chạy', sevBlocking: 'gây chặn', sevLikely: 'có thể', sevNice: 'để biết', sevInfo: 'thông tin', summary: '{b} gây chặn · {l} có thể · {n} nhỏ', runThis: 'Chạy các lệnh sau để bắt đầu:', marked: 'Đã lưu trạng thái hiện tại là trạng thái tốt.', noFingerprint: 'Chưa có trạng thái tốt. Chạy `lastgood mark` khi dự án chạy được.' },
  hi: { reportTitle: 'LastGood — प्रोजेक्ट के आखिरी बार चलने के बाद क्या बदला', lastWorked: 'आखिरी बार चला', clean: 'प्रोजेक्ट के आखिरी बार चलने के बाद कुछ नहीं बदला।', readyRun: 'आप तैयार हैं।', hasBlocking: 'चलने की स्थिति में लौटने के लिए इन्हें ठीक करें।', hasLikely: 'कुछ चीज़ें बदलीं — देख लें।', fix: 'हल', run: 'चलाएँ', sevBlocking: 'रोकने वाला', sevLikely: 'संभावित', sevNice: 'जानकारी', sevInfo: 'जानकारी', summary: '{b} रोकने वाले · {l} संभावित · {n} छोटे', runThis: 'शुरू करने के लिए यह चलाएँ:', marked: 'मौजूदा स्थिति को आखिरी सही के रूप में सहेजा।', noFingerprint: 'अभी कोई सही स्थिति नहीं। जब चले तो `lastgood mark` चलाएँ।' },
  zh: { reportTitle: 'LastGood — 自项目上次正常运行以来的变化', lastWorked: '上次正常运行', clean: '自项目上次正常运行以来没有变化。', readyRun: '可以开始了。', hasBlocking: '修复这些即可恢复到可运行状态。', hasLikely: '有几处变动——值得看看。', fix: '修复', run: '运行', sevBlocking: '阻塞', sevLikely: '可能', sevNice: '供参考', sevInfo: '信息', summary: '{b} 个阻塞 · {l} 个可能 · {n} 个小项', runThis: '运行以下命令即可开始：', marked: '已将当前状态保存为上次正常状态。', noFingerprint: '还没有正常状态。项目正常时运行 `lastgood mark`。' },
  ja: { reportTitle: 'LastGood — プロジェクトが最後に動いてから何が変わったか', lastWorked: '最後に動作', clean: 'プロジェクトが最後に動いてから変化はありません。', readyRun: '準備できています。', hasBlocking: '動く状態に戻すにはこれらを解消してください。', hasLikely: 'いくつか変化あり — 確認を。', fix: '対処', run: '実行', sevBlocking: '阻害', sevLikely: '要確認', sevNice: '参考', sevInfo: '情報', summary: '阻害 {b} · 要確認 {l} · 軽微 {n}', runThis: '開始するには次を実行してください:', marked: '現在の状態を最後の正常状態として保存しました。', noFingerprint: 'まだ正常状態がありません。動いたら `lastgood mark` を実行してください。' },
  ko: { reportTitle: 'LastGood — 프로젝트가 마지막으로 동작한 이후 바뀐 것', lastWorked: '마지막 동작', clean: '프로젝트가 마지막으로 동작한 이후 바뀐 것이 없습니다.', readyRun: '시작할 준비가 됐습니다.', hasBlocking: '동작 상태로 돌아가려면 이것들을 해결하세요.', hasLikely: '몇 가지가 바뀌었습니다 — 확인해 보세요.', fix: '해결', run: '실행', sevBlocking: '차단', sevLikely: '가능성', sevNice: '참고', sevInfo: '정보', summary: '차단 {b} · 가능성 {l} · 사소 {n}', runThis: '시작하려면 다음을 실행하세요:', marked: '현재 상태를 마지막 정상 상태로 저장했습니다.', noFingerprint: '아직 정상 상태가 없습니다. 동작할 때 `lastgood mark`를 실행하세요.' },
  he: { reportTitle: 'LastGood — מה השתנה מאז שהפרויקט עבד לאחרונה', lastWorked: 'עבד לאחרונה', clean: 'שום דבר לא השתנה מאז שהפרויקט עבד.', readyRun: 'הכול מוכן.', hasBlocking: 'תקנו את אלה כדי לחזור למצב עובד.', hasLikely: 'כמה דברים השתנו — שווה לבדוק.', fix: 'תיקון', run: 'הריצו', sevBlocking: 'חוסם', sevLikely: 'סביר', sevNice: 'לידיעה', sevInfo: 'מידע', summary: '{b} חוסמים · {l} סבירים · {n} קלים', runThis: 'הריצו את אלה כדי להתחיל:', marked: 'המצב הנוכחי נשמר כמצב תקין אחרון.', noFingerprint: 'עדיין אין מצב תקין. הריצו `lastgood mark` כשהפרויקט עובד.' },
  ar: { reportTitle: 'LastGood — ما الذي تغيّر منذ آخر مرة عمل فيها مشروعك', lastWorked: 'آخر مرة عمل', clean: 'لم يتغيّر شيء منذ آخر مرة عمل فيها مشروعك.', readyRun: 'أنت جاهز.', hasBlocking: 'أصلح هذه للعودة إلى حالة عاملة.', hasLikely: 'تغيّرت بعض الأمور — يستحق النظر.', fix: 'الإصلاح', run: 'شغّل', sevBlocking: 'مانع', sevLikely: 'مرجّح', sevNice: 'للعلم', sevInfo: 'معلومة', summary: '{b} مانعة · {l} مرجّحة · {n} بسيطة', runThis: 'شغّل هذه لتبدأ:', marked: 'تم حفظ الحالة الحالية كآخر حالة جيدة.', noFingerprint: 'لا توجد حالة جيدة بعد. شغّل `lastgood mark` عندما يعمل.' },
  fa: { reportTitle: 'LastGood — از آخرین باری که پروژه‌ات کار می‌کرد چه تغییر کرد', lastWorked: 'آخرین بار کار کرد', clean: 'از آخرین باری که پروژه‌ات کار می‌کرد چیزی تغییر نکرده.', readyRun: 'آماده‌ای.', hasBlocking: 'این‌ها را برطرف کن تا به حالت کارکرد برگردی.', hasLikely: 'چند چیز تغییر کرده — بهتر است نگاه کنی.', fix: 'راه‌حل', run: 'اجرا کنید', sevBlocking: 'مسدودکننده', sevLikely: 'محتمل', sevNice: 'برای اطلاع', sevInfo: 'اطلاعات', summary: '{b} مسدودکننده · {l} محتمل · {n} جزئی', runThis: 'برای شروع این‌ها را اجرا کنید:', marked: 'وضعیت فعلی به‌عنوان آخرین وضعیت خوب ذخیره شد.', noFingerprint: 'هنوز وضعیت خوبی نیست. وقتی کار کرد `lastgood mark` را اجرا کن.' },
}

export const RTL_LANGS = new Set(['he', 'ar', 'fa'])
export const SUPPORTED_LANGS = Object.keys(DICTS)

export function detectLang(override?: string): string {
  const raw = override || process.env.LANG || process.env.LC_ALL || process.env.LANGUAGE || 'en'
  const code = raw.toLowerCase().split(/[_.\-]/)[0] ?? 'en'
  return DICTS[code] ? code : 'en'
}

export interface Translator {
  lang: string
  rtl: boolean
  t: (key: keyof Dict, vars?: Record<string, string | number>) => string
}

export function makeTranslator(lang: string): Translator {
  const dict = DICTS[lang] ?? {}
  const t = (key: keyof Dict, vars?: Record<string, string | number>): string => {
    let s = dict[key] ?? en[key]
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v))
    return s
  }
  return { lang, rtl: RTL_LANGS.has(lang), t }
}
