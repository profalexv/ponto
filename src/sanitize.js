/**
 * sanitize.js — Helper de sanitização contra XSS
 *
 * Encapsula DOMPurify para uso simples em todo o app.
 * Use safeHTML() em vez de innerHTML direto quando renderizando
 * dados que vieram da API ou de input do usuário.
 */
import DOMPurify from "dompurify";

/**
 * Sanitiza uma string HTML removendo scripts e atributos perigosos.
 * @param {string} dirty - HTML potencialmente inseguro
 * @returns {string} HTML limpo e seguro para injeção no DOM
 */
export function sanitize(dirty) {
  return DOMPurify.sanitize(dirty);
}

/**
 * Injeta HTML sanitizado num elemento de forma segura.
 * Drop-in replacement para: el.innerHTML = html
 * @param {HTMLElement} el - Elemento alvo
 * @param {string} html - HTML potencialmente inseguro
 */
export function safeHTML(el, html) {
  el.innerHTML = DOMPurify.sanitize(html);
}
